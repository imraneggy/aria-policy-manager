"""
monitor.py — Autonomous Monitoring Agent with three sub-agents:

  Scout       — DuckDuckGo web crawler for regulatory updates
  Fact-checker — LLM validates gathered content as VALID/INVALID
  Summarizer  — Chunks validated content and ingests into ChromaDB
"""

import logging
import time
from typing import Optional
from datetime import datetime, timezone

from langchain_text_splitters import RecursiveCharacterTextSplitter

from .rag import get_vector_store
from .config import settings

logger = logging.getLogger(__name__)

# ── Shared monitoring state (exposed to admin routes) ────────────────────────

monitoring_state: dict = {
    "last_run": None,
    "last_status": "never_run",
    "chunks_added": 0,
    "total_runs": 0,
    "last_error": None,
}

# ── Lazy singletons ──────────────────────────────────────────────────────────

_monitor_llm = None
_monitor_search = None


def _get_monitor_llm():
    global _monitor_llm
    if _monitor_llm is None:
        from langchain_community.chat_models import ChatOllama
        _monitor_llm = ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.0,
        )
        logger.debug("Monitor: ChatOllama initialised")
    return _monitor_llm


def _get_monitor_search():
    global _monitor_search
    if _monitor_search is None:
        from langchain_community.tools import DuckDuckGoSearchRun
        _monitor_search = DuckDuckGoSearchRun()
        logger.debug("Monitor: DuckDuckGoSearchRun initialised")
    return _monitor_search


# ── Scout sub-agent ──────────────────────────────────────────────────────────

_SCOUT_QUERIES = [
    "UAE NESA cybersecurity standards updates 2024 2025",
    "ISO 27001 2022 amendment updates new controls",
    "UAE Personal Data Protection Law PDPL enforcement 2024",
    "NIST Cybersecurity Framework 2.0 implementation guidance",
    "CIS Controls v8 updates enterprise security",
    "ADDA Abu Dhabi Digital Authority IT governance guidelines 2024",
    "UAE cybersecurity law Federal Decree 2 2021 enforcement updates",
    "Abu Dhabi IT security policy enterprise compliance 2024",
]


def _scout_search() -> list[dict]:
    """
    Scout sub-agent: runs all 8 queries via DuckDuckGo.
    Returns list of {query, content} dicts for fact-checking.
    """
    search = _get_monitor_search()
    results = []
    for query in _SCOUT_QUERIES:
        try:
            content = search.run(query)
            if content and len(content.strip()) > 80:
                results.append({"query": query, "content": content.strip()})
                logger.debug("Scout: found result for query '%s' (%d chars)", query, len(content))
            else:
                logger.debug("Scout: no useful result for '%s'", query)
            # Small pause to avoid rate limiting
            time.sleep(1)
        except Exception as exc:
            logger.warning("Scout: search failed for '%s': %s", query, exc)
    logger.info("Scout: collected %d raw results from %d queries", len(results), len(_SCOUT_QUERIES))
    return results


# ── Fact-checker sub-agent ───────────────────────────────────────────────────

_FACT_CHECK_PROMPT = """You are an IT Policy Fact-Checker for Ali & Sons Holding, UAE.

Evaluate the following web search result. Determine whether it contains legitimate, \
factual, and useful information specifically about IT security standards, cybersecurity \
regulations, data protection laws, or IT governance frameworks.

Respond with ONLY one word:
- VALID   — if the content is genuine IT policy/security/compliance information
- INVALID — if the content is spam, advertising, irrelevant, or contains no useful regulatory information

Content to evaluate:
{content}
"""


def _fact_check(item: dict) -> bool:
    """
    Fact-checker sub-agent: ask LLM if the content is VALID regulatory information.
    Returns True if VALID.
    """
    from langchain_core.messages import HumanMessage
    try:
        llm = _get_monitor_llm()
        prompt = _FACT_CHECK_PROMPT.format(content=item["content"][:1500])
        response = llm.invoke([HumanMessage(content=prompt)])
        verdict = response.content.strip().upper()
        is_valid = "VALID" in verdict
        logger.debug(
            "Fact-checker: query='%s' verdict='%s' => %s",
            item["query"][:50],
            verdict[:20],
            "VALID" if is_valid else "INVALID",
        )
        return is_valid
    except Exception as exc:
        logger.warning("Fact-checker: LLM call failed for query '%s': %s", item.get("query", "?"), exc)
        return False


# ── Summarizer / ingestion ────────────────────────────────────────────────────

def _ingest_validated(valid_items: list[dict]) -> int:
    """
    Summarizer: chunk validated content with RecursiveCharacterTextSplitter,
    then add to ChromaDB vector store.
    Returns the number of chunks added.
    """
    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)
    all_texts = []
    all_metas = []

    for item in valid_items:
        chunks = splitter.split_text(item["content"])
        for chunk in chunks:
            all_texts.append(chunk)
            all_metas.append({
                "source": "autonomous_monitoring_agent",
                "query": item["query"][:120],
                "ingested_at": datetime.now(timezone.utc).isoformat(),
            })

    if not all_texts:
        return 0

    try:
        store = get_vector_store()
        store.add_texts(all_texts, metadatas=all_metas)
        logger.info("Summarizer: ingested %d chunks into ChromaDB", len(all_texts))
        return len(all_texts)
    except Exception as exc:
        logger.error("Summarizer: ChromaDB ingestion failed: %s", exc)
        return 0


# ── Main monitoring cycle ─────────────────────────────────────────────────────

def run_monitoring_cycle() -> None:
    """
    Full autonomous cycle:
      1. Scout searches the web (8 queries)
      2. Fact-checker validates each result
      3. Summarizer chunks and ingests valid content into ChromaDB

    Updates monitoring_state dict throughout.
    """
    global monitoring_state

    logger.info("=== Monitoring Agent: Starting cycle ===")
    monitoring_state["last_run"] = datetime.now(timezone.utc).isoformat()
    monitoring_state["last_status"] = "running"
    monitoring_state["last_error"] = None

    try:
        # Step 1: Scout
        raw_results = _scout_search()
        if not raw_results:
            monitoring_state["last_status"] = "completed_no_results"
            monitoring_state["total_runs"] += 1
            logger.info("Monitoring Agent: cycle complete — no search results found")
            return

        # Step 2: Fact-check
        logger.info("Monitoring Agent: fact-checking %d results...", len(raw_results))
        valid_items = [item for item in raw_results if _fact_check(item)]
        logger.info(
            "Monitoring Agent: %d/%d results passed fact-check",
            len(valid_items),
            len(raw_results),
        )

        # Step 3: Ingest
        chunks_added = 0
        if valid_items:
            chunks_added = _ingest_validated(valid_items)
        else:
            logger.info("Monitoring Agent: no valid content to ingest this cycle")

        monitoring_state["chunks_added"] += chunks_added
        monitoring_state["last_status"] = "completed_ok"
        monitoring_state["total_runs"] += 1
        logger.info(
            "=== Monitoring Agent: cycle complete — %d new chunks ingested ===",
            chunks_added,
        )

    except Exception as exc:
        monitoring_state["last_status"] = "error"
        monitoring_state["last_error"] = str(exc)
        monitoring_state["total_runs"] += 1
        logger.error("Monitoring Agent: cycle failed with exception: %s", exc)


# ── Scheduler ────────────────────────────────────────────────────────────────

def start_scheduler():
    """
    Start APScheduler to run the monitoring cycle every 6 hours.
    Returns the scheduler instance so main.py can shut it down cleanly.
    """
    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_monitoring_cycle,
        "interval",
        hours=6,
        id="monitoring_cycle",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    logger.info(
        "Autonomous Monitoring Agent scheduler started — "
        "will crawl, fact-check, and ingest updates every 6 hours."
    )
    return scheduler

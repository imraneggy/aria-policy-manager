"""
monitor.py — Autonomous Monitoring Agent with four sub-agents:

  Scout       — DuckDuckGo web crawler for regulatory updates
  Fact-checker — LLM validates gathered content as VALID/INVALID
  Summarizer  — Chunks validated content and ingests into ChromaDB
  Advisor     — Compares findings against existing policies, suggests updates
"""

import json
import logging
import time
from typing import Optional
from datetime import datetime, timezone

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
    from langchain_text_splitters import RecursiveCharacterTextSplitter
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
        from .rag import get_vector_store
        store = get_vector_store()
        store.add_texts(all_texts, metadatas=all_metas)
        logger.info("Summarizer: ingested %d chunks into ChromaDB", len(all_texts))
        return len(all_texts)
    except Exception as exc:
        logger.error("Summarizer: ChromaDB ingestion failed: %s", exc)
        return 0


# ── Advisor sub-agent ────────────────────────────────────────────────────────

_ADVISOR_PROMPT = """You are the Policy Update Advisor for Ali & Sons Holding, UAE.

You receive:
1. New regulatory/compliance information from web search
2. A list of existing corporate IT policies

Your task: Identify which existing policies may need updating based on the new information.

For each policy that needs updating, provide a JSON array. Each entry:
- "policy_name": exact policy name from the list
- "suggestion": what specifically needs updating
- "reason": why (new regulation, updated standard, best practice change)
- "framework": which framework is affected (NESA, ISO27001, PDPL, NIST, CIS, ADDA)
- "severity": CRITICAL (regulatory non-compliance risk), IMPORTANT (best practice gap), or INFO (nice to have)

Respond ONLY with a JSON array. If no updates are needed, respond with: []

Example:
[{"policy_name":"Access Control Policy","suggestion":"Add multi-factor authentication requirement for privileged accounts","reason":"Updated NESA control 3.2.1 now mandates MFA for all administrative access","framework":"NESA","severity":"CRITICAL"}]
"""


def _suggest_policy_updates(valid_items: list[dict]) -> int:
    """
    Advisor sub-agent: compare validated regulatory findings against
    existing corporate policies and generate update suggestions.
    Returns number of suggestions stored.
    """
    from langchain_core.messages import HumanMessage
    from .config import POLICY_LIST

    # Get cached policy overview if available
    policy_overview = "\n".join(f"- {p}" for p in POLICY_LIST)
    try:
        from .policy_cache import get_all_summaries_text
        cached = get_all_summaries_text()
        if cached and "not yet loaded" not in cached.lower():
            policy_overview = cached
    except Exception:
        pass

    # Combine top findings
    findings = "\n\n".join(
        f"Source query: {item['query']}\nContent: {item['content'][:600]}"
        for item in valid_items[:5]
    )

    prompt = (
        f"{_ADVISOR_PROMPT}\n\n"
        f"[EXISTING CORPORATE POLICIES]\n{policy_overview}\n\n"
        f"[NEW REGULATORY FINDINGS]\n{findings}"
    )

    try:
        llm = _get_monitor_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        raw = response.content.strip()
        # Extract JSON array — handle LLM outputting extra text around the array
        start = raw.find("[")
        end = raw.rfind("]") + 1
        suggestions = []
        if start >= 0 and end > start:
            json_str = raw[start:end]
            try:
                suggestions = json.loads(json_str)
            except json.JSONDecodeError:
                # Try to fix common LLM JSON issues: trailing commas, etc.
                import re
                cleaned = re.sub(r",\s*]", "]", json_str)
                cleaned = re.sub(r",\s*}", "}", cleaned)
                try:
                    suggestions = json.loads(cleaned)
                except json.JSONDecodeError:
                    # Last resort: parse individual objects
                    for match in re.finditer(r"\{[^{}]+\}", json_str):
                        try:
                            obj = json.loads(match.group())
                            if obj.get("policy_name") and obj.get("suggestion"):
                                suggestions.append(obj)
                        except json.JSONDecodeError:
                            continue
                    logger.info("Advisor: recovered %d suggestions from malformed JSON", len(suggestions))

        if suggestions:
            return _store_suggestions(suggestions)
        return 0
    except Exception as exc:
        logger.warning("Advisor: failed to generate suggestions: %s", exc)
        return 0


def _store_suggestions(suggestions: list[dict]) -> int:
    """Store policy update suggestions in SQLite."""
    from .database import get_db

    stored = 0
    try:
        with get_db() as conn:
            for s in suggestions:
                policy_name = s.get("policy_name", "").strip()
                suggestion = s.get("suggestion", "").strip()
                if not policy_name or not suggestion:
                    continue
                reason = s.get("reason", "")
                full_suggestion = f"{suggestion} — {reason}" if reason else suggestion
                conn.execute(
                    "INSERT INTO policy_update_suggestions "
                    "(policy_name, suggestion, source_query, framework, severity, status, created_at) "
                    "VALUES (?, ?, ?, ?, ?, 'pending', ?)",
                    (
                        policy_name,
                        full_suggestion,
                        "",
                        s.get("framework", ""),
                        s.get("severity", "INFO"),
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
                stored += 1
        logger.info("Advisor: stored %d policy update suggestions", stored)
    except Exception as exc:
        logger.error("Advisor: failed to store suggestions: %s", exc)
    return stored


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

        # Step 4: Advisor — suggest policy updates based on findings
        suggestions_added = 0
        if valid_items:
            logger.info("Monitoring Agent: running Advisor sub-agent...")
            suggestions_added = _suggest_policy_updates(valid_items)
            logger.info(
                "Monitoring Agent: Advisor generated %d update suggestions",
                suggestions_added,
            )

        monitoring_state["chunks_added"] += chunks_added
        monitoring_state["suggestions_added"] = monitoring_state.get("suggestions_added", 0) + suggestions_added
        monitoring_state["last_status"] = "completed_ok"
        monitoring_state["total_runs"] += 1
        logger.info(
            "=== Monitoring Agent: cycle complete — %d chunks ingested, %d suggestions ===",
            chunks_added,
            suggestions_added,
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
    Also schedules a one-time initial run 2 minutes after startup
    (gives Ollama time to warm up).
    Returns the scheduler instance so main.py can shut it down cleanly.
    """
    from apscheduler.schedulers.background import BackgroundScheduler
    from datetime import datetime as dt, timedelta as td, timezone as tz

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        run_monitoring_cycle,
        "interval",
        hours=6,
        id="monitoring_cycle",
        max_instances=1,
        coalesce=True,
    )
    # Schedule initial run 2 minutes after startup
    scheduler.add_job(
        run_monitoring_cycle,
        "date",
        run_date=dt.now(tz.utc) + td(minutes=2),
        id="monitoring_initial",
        max_instances=1,
    )
    scheduler.start()
    logger.info(
        "Autonomous Monitoring Agent scheduler started — "
        "initial run in 2 minutes, then every 6 hours."
    )
    return scheduler


def trigger_monitoring_now() -> str:
    """Manually trigger a monitoring cycle. Returns status message."""
    if monitoring_state.get("last_status") == "running":
        return "already_running"
    import threading
    thread = threading.Thread(target=run_monitoring_cycle, daemon=True, name="monitor-manual")
    thread.start()
    return "started"

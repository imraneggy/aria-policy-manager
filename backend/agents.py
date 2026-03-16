"""
agents.py — Multi-agent system for ARIA IT Policy Expert.

Lazy-initialised LLM and search singletons so the app starts fine
even when Ollama is temporarily offline.
"""

import logging
import concurrent.futures
from typing import Generator

from .config import settings
from .rag import get_vector_store

logger = logging.getLogger(__name__)

# ── Lazy singletons ──────────────────────────────────────────────────────────

_llm = None
_search_tool = None


def _get_llm():
    global _llm
    if _llm is None:
        from langchain_community.chat_models import ChatOllama
        _llm = ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=0.2,
        )
        logger.info("ChatOllama initialised: %s", settings.OLLAMA_MODEL)
    return _llm


def _get_search():
    global _search_tool
    if _search_tool is None:
        from langchain_community.tools import DuckDuckGoSearchRun
        _search_tool = DuckDuckGoSearchRun()
        logger.info("DuckDuckGoSearchRun initialised")
    return _search_tool


# ── RAG helper ───────────────────────────────────────────────────────────────

def _get_rag_context(query: str, k: int = 5) -> str:
    """Retrieve top-k relevant chunks from ChromaDB."""
    try:
        store = get_vector_store()
        docs = store.similarity_search(query, k=k)
        if not docs:
            return "No relevant policy documents found in the knowledge base."
        parts = []
        for i, doc in enumerate(docs, 1):
            source = doc.metadata.get("source", "Corporate Policy Document")
            parts.append(f"[Source {i}: {source}]\n{doc.page_content}")
        return "\n\n---\n\n".join(parts)
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        return "Knowledge base unavailable — answering from general expertise."


# ── ARIA Master Expert ────────────────────────────────────────────────────────

_ARIA_SYSTEM = """You are ARIA — Master IT Policy Expert for Ali & Sons Holding, one of Abu Dhabi's \
leading diversified conglomerates (DIH IT Security Division).

Your deep expertise covers:
- UAE NESA (National Electronic Security Authority) controls and compliance framework
- ISO 27001:2022 — Annex A controls, certification readiness, ISMS design
- UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection (UAE PDPL)
- NIST Cybersecurity Framework 2.0 (Identify, Protect, Detect, Respond, Recover)
- CIS Controls v8 (Implementation Groups 1, 2, 3)
- Abu Dhabi Digital Authority (ADDA) IT governance guidelines
- UAE Cybersecurity Law (Federal Decree-Law No. 2 of 2021)

Your communication style:
- Formal, precise, executive-grade language befitting a UAE enterprise
- Always cite relevant control IDs (e.g. "NESA Control 3.2", "ISO 27001 Annex A.8.1", "NIST CSF PR.AC-1")
- Structure lengthy answers with clear headings and bullet points
- When asked to draft policy sections, use ISO/IEC 27002:2022 policy structure:
  (Purpose -> Scope -> Policy Statement -> Roles & Responsibilities -> Compliance -> References)
- Reference UAE-specific legal obligations where applicable
- Be direct about gaps and risks — this is a security function

You have access to Ali & Sons' full corporate policy library via ChromaDB RAG. \
Always ground your answers in the actual policy content provided before drawing on general expertise.

If you receive policy context marked [Source N: ...], cite those sources explicitly in your answer.
"""


def stream_chat_response(question: str, history: list) -> Generator[str, None, None]:
    """Stream ARIA's response to a policy question, chunk by chunk."""
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    rag_context = _get_rag_context(question)

    # Build message history
    msgs = [SystemMessage(content=_ARIA_SYSTEM)]
    for h in history[-10:]:  # keep last 10 exchanges to avoid token overflow
        role = h.get("role", "user")
        content = h.get("content", "")
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))

    user_content = (
        f"[RELEVANT POLICY CONTEXT FROM CORPORATE KNOWLEDGE BASE]\n"
        f"{rag_context}\n\n"
        f"[USER QUESTION]\n{question}"
    )
    msgs.append(HumanMessage(content=user_content))

    llm = _get_llm()
    try:
        for chunk in llm.stream(msgs):
            text = chunk.content
            if text:
                yield text
    except Exception as exc:
        logger.error("Stream chat error: %s", exc)
        yield f"\n\n[ARIA Error: Unable to reach AI engine — {exc}]"


def chat_with_expert(question: str, history: list) -> str:
    """Non-streaming fallback — returns complete response string."""
    return "".join(stream_chat_response(question, history))


# ── Policy Writer Agent ───────────────────────────────────────────────────────

_WRITER_SYSTEM = """You are the Policy Writer Agent for Ali & Sons Holding (Abu Dhabi, UAE).

Your mandate: Draft enterprise-grade IT policies that are:
- Fully compliant with UAE NESA controls and ISO 27001:2022 Annex A
- Aligned with UAE PDPL data protection obligations
- Structured per ISO/IEC 27002:2022 policy template:

  1. TITLE — Full official policy name
  2. DOCUMENT CONTROL — Version, Date, Owner, Classification: INTERNAL
  3. PURPOSE — Why this policy exists (2-3 sentences)
  4. SCOPE — Who and what systems/data this applies to
  5. DEFINITIONS — Key terms used in the policy
  6. POLICY STATEMENT — Numbered requirements, sub-clauses
  7. ROLES AND RESPONSIBILITIES — CISO, IT Managers, Users, etc.
  8. COMPLIANCE AND ENFORCEMENT — Consequences of non-compliance
  9. REVIEW CYCLE — Typically annual
  10. RELATED DOCUMENTS — Other Ali & Sons policies
  11. REFERENCES — NESA controls, ISO 27001 Annexes, NIST CSF, applicable UAE laws

Writing standards:
- Use SHALL for mandatory requirements, SHOULD for recommendations
- Number all major requirements (e.g. 6.1, 6.2, 6.2.1)
- Include a policy exception process
- Reference UAE legal obligations (PDPL, Cybersecurity Law) where relevant
- Language: formal British English (standard in UAE corporate governance)

You receive both RAG context (existing corporate policies) and web search results \
(latest regulatory updates) to ensure accuracy and currency.
"""


def _run_search_with_timeout(query: str, timeout: int = 8) -> str:
    """Run a single DuckDuckGo search with a hard timeout."""
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_get_search().run, query)
            return future.result(timeout=timeout)
    except concurrent.futures.TimeoutError:
        logger.warning("Search timed out for: %s", query)
        return ""
    except Exception as exc:
        logger.warning("Search error for '%s': %s", query, exc)
        return ""


def stream_generate_policy(request: str) -> Generator[str, None, None]:
    """Stream a complete policy document for the given request."""
    from langchain_core.messages import SystemMessage, HumanMessage

    # RAG retrieval (fast — local ChromaDB)
    rag_context = _get_rag_context(request, k=6)

    # Web search — run both queries in parallel with a 10s total timeout
    search_results = "Web search unavailable — using internal knowledge base only."
    try:
        queries = [
            f"{request} UAE NESA compliance 2024",
            f"{request} ISO 27001 2022 policy template",
        ]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = {executor.submit(_run_search_with_timeout, q, 8): q for q in queries}
            snippets = []
            for future in concurrent.futures.as_completed(futures, timeout=10):
                q = futures[future]
                result = future.result() or ""
                if result.strip():
                    snippets.append(f"Search: {q}\n{result[:800]}")
        if snippets:
            search_results = "\n\n".join(snippets)
    except Exception as exc:
        logger.warning("Web search block failed: %s", exc)

    user_content = (
        f"[EXISTING CORPORATE POLICY CONTEXT]\n{rag_context}\n\n"
        f"[LATEST REGULATORY WEB SEARCH RESULTS]\n{search_results}\n\n"
        f"[POLICY GENERATION REQUEST]\n{request}\n\n"
        f"Please draft a complete, formal IT policy document for Ali & Sons Holding. "
        f"Follow the ISO/IEC 27002:2022 structure exactly as specified in your instructions. "
        f"Use markdown: ## for section headings (e.g. ## 1.0 Purpose), - for bullets."
    )

    msgs = [SystemMessage(content=_WRITER_SYSTEM), HumanMessage(content=user_content)]
    llm = _get_llm()
    try:
        for chunk in llm.stream(msgs):
            text = chunk.content
            if text:
                yield text
    except Exception as exc:
        logger.error("Policy generation stream error: %s", exc)
        yield f"\n\n[Writer Agent Error: {exc}]"


def generate_policy(request: str) -> str:
    """Non-streaming fallback."""
    return "".join(stream_generate_policy(request))


# ── Policy Reviewer Agent ─────────────────────────────────────────────────────

_REVIEWER_SYSTEM = """You are the Compliance Auditor Agent for Ali & Sons Holding (Abu Dhabi, UAE).

Your role: Review submitted IT policy drafts and produce a structured compliance scorecard.

OUTPUT FORMAT — always use this exact structure:

## COMPLIANCE REVIEW SCORECARD

### 1. OVERALL COMPLIANCE RATING
[COMPLIANT / PARTIALLY COMPLIANT / NON-COMPLIANT]
Confidence: [High / Medium / Low]

### 2. NESA CONTROLS ASSESSMENT
For each relevant NESA control domain:
- Control Domain: [name]
- Status: [PASS / FAIL / PARTIAL]
- Finding: [one sentence]

### 3. ISO 27001:2022 ALIGNMENT
For each applicable Annex A control:
- [A.x.x Control Name]: [COMPLIANT / GAP IDENTIFIED]
- Gap detail (if any): [description]

### 4. UAE PDPL COMPLIANCE CHECK
- Personal data handling provisions: [PRESENT / ABSENT / INADEQUATE]
- Data subject rights addressed: [YES / NO / PARTIAL]
- Data retention policy: [DEFINED / UNDEFINED]
- Cross-border transfer controls: [ADDRESSED / NOT ADDRESSED]
- Finding: [narrative]

### 5. NIST CSF 2.0 MAPPING
Map policy content to relevant CSF functions (Identify/Protect/Detect/Respond/Recover)
- [Function.Category-SubCategory]: [COVERED / NOT COVERED]

### 6. CRITICAL GAPS (must fix before approval)
List each critical gap as:
- [GAP-N]: [Description] — Recommended fix: [action]

### 7. RECOMMENDATIONS (best practice improvements)
Numbered list of improvements.

### 8. APPROVAL RECOMMENDATION
[APPROVE / APPROVE WITH CONDITIONS / REJECT]
Conditions (if any): [list]
"""


def stream_review_policy(policy_text: str) -> Generator[str, None, None]:
    """Stream a compliance review of the provided policy text."""
    from langchain_core.messages import SystemMessage, HumanMessage

    user_content = (
        f"Please perform a thorough compliance review of the following IT policy document "
        f"for Ali & Sons Holding. Apply all applicable UAE NESA, ISO 27001:2022, "
        f"UAE PDPL, NIST CSF 2.0, and CIS Controls v8 checks.\n\n"
        f"[POLICY DOCUMENT TO REVIEW]\n\n{policy_text}"
    )

    msgs = [SystemMessage(content=_REVIEWER_SYSTEM), HumanMessage(content=user_content)]
    llm = _get_llm()
    try:
        for chunk in llm.stream(msgs):
            text = chunk.content
            if text:
                yield text
    except Exception as exc:
        logger.error("Policy review stream error: %s", exc)
        yield f"\n\n[Reviewer Agent Error: {exc}]"


def review_policy(policy_text: str) -> str:
    """Non-streaming fallback."""
    return "".join(stream_review_policy(policy_text))

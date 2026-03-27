"""
agents.py — Multi-agent system for AEGIS IT Policy Expert.

Lazy-initialised LLM and search singletons so the app starts fine
even when Ollama is temporarily offline.
"""

import logging
import concurrent.futures
from typing import Generator

from .config import settings

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
        from .rag import get_vector_store
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


# ── AEGIS Master Expert ────────────────────────────────────────────────────────

def _build_aria_system() -> str:
    """Build AEGIS system prompt with full policy library names for NLU."""
    from .config import POLICY_LIST
    policy_list = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(POLICY_LIST))
    return f"""You are AEGIS — Master IT Policy Expert for Ali & Sons Holding, one of Abu Dhabi's \
leading diversified conglomerates (DIH IT Security Division).

Your deep expertise covers:
- UAE NESA (National Electronic Security Authority) controls and compliance framework
- ISO 27001:2022 — Annex A controls, certification readiness, ISMS design
- UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection (UAE PDPL)
- NIST Cybersecurity Framework 2.0 (Identify, Protect, Detect, Respond, Recover)
- CIS Controls v8 (Implementation Groups 1, 2, 3)
- Abu Dhabi Digital Authority (ADDA) IT governance guidelines
- UAE Cybersecurity Law (Federal Decree-Law No. 2 of 2021)

CORPORATE POLICY LIBRARY — You have full knowledge of these 25 Ali & Sons IT policies \
(all are stored in your RAG knowledge base and you can retrieve their contents):
{policy_list}

NATURAL LANGUAGE UNDERSTANDING:
- When a user asks about a topic (e.g. "backup", "email", "virus", "cloud", "SAP", \
"printers", "disaster recovery", "risk", "removable media", "passwords", "AI tools", \
"logging", "social media", "intranet", "training"), intelligently map their query to \
the relevant policy or policies from the library above.
- Accept casual, abbreviated, or synonym-based questions. E.g. "what's our USB policy?" \
should map to Removable Media Policy. "antivirus rules" maps to Anti-Virus and Patch \
Management Policy. "can I use ChatGPT?" maps to AI Tools Usage Policy and LLM Acceptable \
Use Policy.
- When multiple policies are relevant, reference all of them.
- If the user asks "list all policies" or "what policies do we have", list the full 25 \
with brief one-line summaries of each.

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


_AEGIS_SYSTEM = _build_aria_system()


def stream_chat_response(question: str, history: list) -> Generator[str, None, None]:
    """Stream AEGIS's response with cached policy context for faster answers."""
    from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

    rag_context = _get_rag_context(question, k=8)

    # Get cached policy summaries for broader context
    cache_context = ""
    try:
        from .policy_cache import search_cache, get_all_summaries_text
        cache_results = search_cache(question, max_results=3)
        if cache_results:
            cache_context = "\n".join(
                f"- {r['policy']} (relevance: {r['score']}, "
                f"matched sections: {', '.join(r['sections_matched'][:3])})"
                for r in cache_results
            )
        else:
            cache_context = get_all_summaries_text()
    except Exception:
        pass

    # Build message history
    msgs = [SystemMessage(content=_AEGIS_SYSTEM)]
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
    )
    if cache_context:
        user_content += f"[CACHED POLICY LIBRARY OVERVIEW]\n{cache_context}\n\n"
    user_content += f"[USER QUESTION]\n{question}"
    msgs.append(HumanMessage(content=user_content))

    llm = _get_llm()
    try:
        for chunk in llm.stream(msgs):
            text = chunk.content
            if text:
                yield text
    except Exception as exc:
        logger.error("Stream chat error: %s", exc)
        yield f"\n\n[AEGIS Error: Unable to reach AI engine — {exc}]"


def chat_with_expert(question: str, history: list) -> str:
    """Non-streaming fallback — returns complete response string."""
    return "".join(stream_chat_response(question, history))


# ── Policy Writer Agent ───────────────────────────────────────────────────────

_WRITER_SYSTEM = """You are the Policy Writer Agent for Ali & Sons Holding (Abu Dhabi, UAE), \
DIH IT Security Division.

Your mandate: Draft enterprise-grade IT policies that comply with UAE national standards \
and international best practices.

COMPLIANCE FRAMEWORKS (must address ALL applicable controls):
1. UAE NESA (National Electronic Security Authority) — all relevant control domains
2. ISO 27001:2022 — Annex A controls and ISMS requirements
3. ISO/IEC 27002:2022 — implementation guidance
4. UAE PDPL (Federal Decree-Law No. 45 of 2021) — data protection obligations
5. NIST Cybersecurity Framework 2.0 — Identify, Protect, Detect, Respond, Recover
6. CIS Controls v8 — Implementation Groups 1-3
7. UAE Cybersecurity Law (Federal Decree-Law No. 2 of 2021)
8. ADDA (Abu Dhabi Digital Authority) — IT governance guidelines

DOCUMENT STRUCTURE — Follow Ali & Sons Holding standard format exactly:

# [POLICY TITLE]

## 1.0 Purpose
Why this policy exists. Clear, 2-3 sentences linking to business objectives and regulatory need.

## 2.0 Scope
Who and what this applies to — departments, systems, data types, personnel, \
third-party vendors. Be specific about inclusions and exclusions.

## 3.0 Definitions
Key terms and abbreviations used in the document. Include regulatory terms \
(e.g. "Data Subject", "Personal Data", "Critical National Infrastructure").

## 4.0 Policy Statement
Numbered mandatory requirements (4.1, 4.2, 4.2.1, etc.).
- SHALL = mandatory requirement
- SHOULD = recommended practice
- MAY = optional/permissive
Each requirement must map to at least one compliance framework control. \
Group requirements logically by topic using sub-sections (4.1 Access Management, \
4.2 Authentication, etc.).

## 5.0 Roles and Responsibilities
Define responsibilities for each role:
- CISO / IT Security Manager
- IT Department / System Administrators
- Department Managers / Data Owners
- All Users / Employees
- Third-Party Vendors and Contractors
- Internal Audit

## 6.0 Compliance and Enforcement
- Consequences of non-compliance (disciplinary action, access revocation, legal action)
- Policy exception process (request, approval authority, documentation, time limit)
- Audit and monitoring provisions
- Reporting obligations

## 7.0 Related Documents
Cross-reference other Ali & Sons IT policies from the corporate library.

## 8.0 Regulatory References
Comprehensive mapping of policy sections to specific controls:
- NESA: [Control domain and specific IDs]
- ISO 27001:2022: [Annex A control references, e.g. A.5.1, A.8.1]
- NIST CSF 2.0: [Function.Category-Subcategory, e.g. PR.AC-1]
- UAE PDPL: [Article references, e.g. Article 5, Article 20]
- CIS Controls v8: [Control numbers and sub-controls]
- UAE Cybersecurity Law: [Relevant articles]

## 9.0 Review and Revision
Annual review cycle. Document owner, review committee composition, \
triggers for ad-hoc review (regulatory changes, incidents, organisational changes).

## 10.0 Appendices
Supporting materials: implementation checklists, templates, workflow diagrams.

WRITING STANDARDS:
- Formal British English (standard in UAE corporate governance)
- SHALL = mandatory, SHOULD = recommended, MAY = optional
- Number all requirements hierarchically (4.1, 4.1.1, 4.1.2, etc.)
- Include a policy exception process in section 6.0
- Reference UAE legal obligations explicitly with article numbers
- Be specific and actionable — avoid vague language like "appropriate measures"
- Include implementation timelines where applicable
- Address both technical and administrative controls
- Reference Ali & Sons Holding by full legal name on first use

You receive RAG context (existing corporate policies), cached policy analysis, \
and web search results (latest regulatory updates) to ensure accuracy and currency.

FORMAT: Use markdown with # for the title, ## for major sections (1.0, 2.0, ...), \
### for subsections, - for bullets.
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


def _learn_org_patterns() -> str:
    """
    Deep-learn from existing policy library: extract organisational patterns,
    terminology, roles, infrastructure references, and structural conventions
    that should be replicated in new policies.
    """
    try:
        from .policy_cache import get_cached_policies
        cache = get_cached_policies()
        if not cache:
            return ""

        # Extract patterns from actual corporate policies
        org_roles = set()
        org_terms = set()
        doc_ids_seen = []
        section_patterns = []
        infra_refs = set()

        role_keywords = {
            "ciso", "cio", "cido", "itd", "gm", "hod", "gmd",
            "it department", "it security", "information technology",
            "internal audit", "hr department", "legal", "compliance",
            "system administrator", "data owner", "data custodian",
        }
        infra_keywords = {
            "sap", "office365", "o365", "microsoft", "active directory",
            "erp", "intranet", "sharepoint", "azure", "vpn", "firewall",
            "antivirus", "endpoint", "wifi", "lan", "wan", "server",
        }

        for name, data in cache.items():
            text_lower = data.get("full_text", "").lower()
            meta = data.get("metadata", {})

            if meta.get("doc_id"):
                doc_ids_seen.append(meta["doc_id"])

            # Collect section structure patterns
            sections = data.get("sections", [])
            if sections:
                titles = [f"{s.get('number', '')} {s.get('title', '')}" for s in sections[:10]]
                section_patterns.append(f"  {name}: {' → '.join(titles)}")

            # Find roles mentioned
            for role in role_keywords:
                if role in text_lower:
                    org_roles.add(role.upper() if len(role) <= 4 else role.title())

            # Find infrastructure references
            for term in infra_keywords:
                if term in text_lower:
                    infra_refs.add(term.upper() if len(term) <= 4 else term.title())

        parts = []
        if org_roles:
            parts.append(f"Organisational roles referenced: {', '.join(sorted(org_roles))}")
        if infra_refs:
            parts.append(f"IT infrastructure/systems referenced: {', '.join(sorted(infra_refs))}")
        if doc_ids_seen:
            parts.append(f"Document ID format: {doc_ids_seen[0]} (series: {', '.join(doc_ids_seen[:5])})")
        if section_patterns:
            parts.append("Section structure from existing policies:\n" + "\n".join(section_patterns[:5]))

        return "\n".join(parts) if parts else ""

    except Exception as exc:
        logger.warning("Failed to learn org patterns: %s", exc)
        return ""


def stream_generate_policy(request: str) -> Generator[str, None, None]:
    """
    Stream a complete policy document. Enhanced with deep organisational learning:
    1. RAG retrieval from ChromaDB (top-8 relevant chunks)
    2. Policy library pattern analysis (roles, infra, structure, terminology)
    3. Cached policy summaries for cross-referencing
    4. Parallel web search for latest regulatory standards
    """
    from langchain_core.messages import SystemMessage, HumanMessage

    # 1. RAG retrieval (deep — 8 chunks for comprehensive context)
    rag_context = _get_rag_context(request, k=8)

    # 2. Learn organisational patterns from existing policy library
    org_patterns = _learn_org_patterns()

    # 3. Cached policy library for structural reference and cross-referencing
    cache_context = ""
    try:
        from .policy_cache import search_cache, get_all_summaries_text
        related = search_cache(request, max_results=5)
        if related:
            cache_context = "Relevant existing policies for cross-reference:\n" + "\n".join(
                f"- {r['policy']} ({r['section_count']} sections, matched: {', '.join(r['sections_matched'][:3])})"
                for r in related
            )
        else:
            cache_context = get_all_summaries_text()
    except Exception:
        pass

    # 4. Web search — parallel queries for latest regulatory context
    search_results = "Web search unavailable — using internal knowledge base only."
    try:
        queries = [
            f"{request} UAE NESA compliance requirements 2025 2026",
            f"{request} ISO 27001 2022 Annex A controls best practice",
            f"{request} UAE PDPL Federal Decree-Law 45 data protection",
            f"{request} NIST CSF 2.0 implementation enterprise policy",
        ]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(_run_search_with_timeout, q, 8): q for q in queries}
            snippets = []
            for future in concurrent.futures.as_completed(futures, timeout=15):
                q = futures[future]
                result = future.result() or ""
                if result.strip():
                    snippets.append(f"Search: {q}\n{result[:800]}")
        if snippets:
            search_results = "\n\n".join(snippets)
    except Exception as exc:
        logger.warning("Web search block failed: %s", exc)

    # Build comprehensive prompt with all intelligence layers
    user_content = f"[EXISTING CORPORATE POLICY CONTEXT FROM CHROMADB RAG]\n{rag_context}\n\n"

    if org_patterns:
        user_content += (
            f"[ORGANISATIONAL INTELLIGENCE — LEARNED FROM EXISTING ALI & SONS POLICY LIBRARY]\n"
            f"{org_patterns}\n\n"
            f"IMPORTANT: Use the exact same roles, terminology, infrastructure references, and document "
            f"ID conventions found in the existing policy library above. The new policy must read as if "
            f"it was written by the same team that authored the existing policies.\n\n"
        )

    if cache_context:
        user_content += f"[CORPORATE POLICY LIBRARY — CROSS-REFERENCE]\n{cache_context}\n\n"

    user_content += (
        f"[LATEST REGULATORY & BEST-PRACTICE WEB RESEARCH]\n{search_results}\n\n"
        f"[POLICY GENERATION REQUEST]\n{request}\n\n"
        f"Draft a complete, formal IT policy document for Ali & Sons Holding LLC. "
        f"Follow the ASH document structure exactly: "
        f"# Title, ## 1.0 Purpose, ## 2.0 Scope, ## 3.0 Definitions, "
        f"## 4.0 Policy Statement (with numbered sub-clauses 4.1, 4.2, 4.2.1, etc.), "
        f"## 5.0 Roles and Responsibilities, ## 6.0 Compliance and Enforcement, "
        f"## 7.0 Related Documents (cross-reference existing ASH policies), "
        f"## 8.0 Regulatory References (specific control IDs), "
        f"## 9.0 Review and Revision, ## 10.0 Appendices.\n\n"
        f"CRITICAL REQUIREMENTS:\n"
        f"- Replicate the exact tone, terminology, and writing style of the existing Ali & Sons policies\n"
        f"- Reference the same organisational roles (CIDO, ITD, HOD, GM, etc.) found in the library\n"
        f"- Reference the same IT systems and infrastructure (SAP, Office365, Active Directory, etc.)\n"
        f"- Cross-reference related existing ASH policies by their document ID in section 7.0\n"
        f"- Use formal British English consistent with UAE corporate governance standards\n"
        f"- Include specific control IDs for every framework reference\n"
        f"Use markdown formatting throughout."
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
        yield "\n\n[Writer Agent Error: Unable to generate policy. Please try again.]"


def generate_policy(request: str) -> str:
    """Non-streaming fallback."""
    return "".join(stream_generate_policy(request))


# ── Policy Finalizer Agent ───────────────────────────────────────────────────

_FINALIZER_SYSTEM = """You are the Policy Finalizer Agent for Ali & Sons Holding (Abu Dhabi, UAE).

Your role: Take an approved and edited policy draft and produce the FINAL official \
document in publication-ready format.

You will receive:
1. The approved policy draft (already edited and reviewed by the CISO/IT Manager)
2. Document metadata (ID, version, dates, approvers)

Your tasks:
1. Clean up formatting: fix inconsistent numbering, normalize heading levels
2. Ensure all section numbers are sequential (1.0, 2.0, 3.0, etc.)
3. Ensure sub-section numbering is consistent (4.1, 4.1.1, 4.1.2, etc.)
4. Verify all compliance references are properly cited with specific control IDs
5. Ensure formal British English throughout
6. Add any missing standard sections (Purpose, Scope, Definitions, etc.)
7. Cross-reference related Ali & Sons policies where applicable
8. Format the regulatory references section with proper control IDs
9. Ensure all SHALL/SHOULD/MAY usage is consistent

Output the complete finalized policy document in markdown format, ready for \
PDF/DOCX export. Start with: # [POLICY TITLE]

FORMAT: Use # for the title, ## for major sections, ### for subsections, - for bullets.
"""


def stream_finalize_policy(draft: str, metadata: dict) -> Generator[str, None, None]:
    """Stream a finalized, publication-ready policy document."""
    from langchain_core.messages import SystemMessage, HumanMessage

    meta_text = "\n".join(f"- {k}: {v}" for k, v in metadata.items() if v)

    user_content = (
        f"[DOCUMENT METADATA]\n{meta_text}\n\n"
        f"[APPROVED POLICY DRAFT]\n{draft}\n\n"
        f"Please finalize this policy document for official publication by Ali & Sons "
        f"Holding LLC. Clean up formatting, ensure consistent section numbering, "
        f"verify compliance references have specific control IDs, and produce "
        f"the complete publication-ready document."
    )

    msgs = [SystemMessage(content=_FINALIZER_SYSTEM), HumanMessage(content=user_content)]
    llm = _get_llm()
    try:
        for chunk in llm.stream(msgs):
            text = chunk.content
            if text:
                yield text
    except Exception as exc:
        logger.error("Policy finalize stream error: %s", exc)
        yield "\n\n[Finalizer Agent Error: Unable to process. Please try again.]"


def finalize_policy(draft: str, metadata: dict) -> str:
    """Non-streaming fallback."""
    return "".join(stream_finalize_policy(draft, metadata))


# ── Policy Reviser Agent ─────────────────────────────────────────────────────

_REVISER_SYSTEM = """You are the Policy Reviser Agent for Ali & Sons Holding (Abu Dhabi, UAE).

Your role: Take a policy draft and the reviewer's feedback/comments, then produce \
a revised version that addresses ALL of the feedback.

Rules:
1. Read every comment carefully and apply the requested changes precisely
2. Maintain the same document structure (section numbering, heading format)
3. Do NOT remove sections unless explicitly asked
4. Do NOT change content that was not mentioned in the feedback
5. If the reviewer asks to add new content, integrate it in the appropriate section
6. If the reviewer asks to strengthen/weaken language, adjust SHALL/SHOULD/MAY accordingly
7. If the reviewer asks for more detail on compliance, add specific control IDs
8. Preserve formal British English throughout
9. After applying changes, ensure section numbering remains sequential

Output the COMPLETE revised policy document in markdown format.
Start with: # [POLICY TITLE]
Use ## for major sections, ### for subsections, - for bullets.
"""


def stream_revise_policy(draft: str, comments: str) -> Generator[str, None, None]:
    """Stream a revised policy based on user feedback/comments."""
    from langchain_core.messages import SystemMessage, HumanMessage

    user_content = (
        f"[CURRENT POLICY DRAFT]\n{draft}\n\n"
        f"[REVIEWER FEEDBACK / REQUESTED CHANGES]\n{comments}\n\n"
        f"Please revise the policy document above to address ALL of the reviewer's "
        f"feedback. Output the complete revised document."
    )

    msgs = [SystemMessage(content=_REVISER_SYSTEM), HumanMessage(content=user_content)]
    llm = _get_llm()
    try:
        for chunk in llm.stream(msgs):
            text = chunk.content
            if text:
                yield text
    except Exception as exc:
        logger.error("Policy revise stream error: %s", exc)
        yield "\n\n[Reviser Agent Error: Unable to process changes. Please try again.]"


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


# ── Policy Renewal Agent ────────────────────────────────────────────────────

_RENEWAL_SYSTEM = """You are the Policy Renewal Agent for Ali & Sons Holding (Abu Dhabi, UAE).

Your role: Review an existing approved policy against the LATEST UAE regulatory standards \
and international best practices to determine if it needs updating for its annual renewal.

You will receive:
1. The current approved policy document
2. Web search results showing the latest regulatory updates
3. Existing corporate policy context from the knowledge base

Your tasks:
1. Compare the policy against current UAE NESA standards (2024-2025 updates)
2. Check alignment with latest ISO 27001:2022 amendments
3. Verify UAE PDPL compliance with latest enforcement guidance
4. Check NIST CSF 2.0 alignment
5. Identify any new ADDA guidelines that should be incorporated
6. Check for outdated references, expired dates, or superseded standards
7. Identify any gaps in the policy based on recent cyber threat landscape

OUTPUT FORMAT:

## ANNUAL RENEWAL REVIEW

### RENEWAL STATUS
[RENEW AS-IS / MINOR UPDATES NEEDED / MAJOR REVISION REQUIRED]

### REGULATORY CHANGES SINCE LAST APPROVAL
- [List each regulatory change that affects this policy]

### RECOMMENDED UPDATES
For each update needed:
- Section: [section number and title]
- Current: [what the policy currently says]
- Recommended: [what it should say]
- Reason: [regulatory change, best practice update, or gap identified]
- Priority: [CRITICAL / IMPORTANT / MINOR]

### NEW SECTIONS TO ADD
- [List any new sections needed based on regulatory changes]

### SECTIONS TO REMOVE OR MERGE
- [List any obsolete sections]

### UPDATED REGULATORY REFERENCES
- [List all regulatory references that need updating with new control IDs]

### RENEWAL RECOMMENDATION
[Clear recommendation with specific next steps]

After listing the changes, produce the COMPLETE UPDATED policy document in markdown \
format incorporating ALL recommended changes. Start with: # [POLICY TITLE]
"""


def stream_renew_policy(policy_text: str) -> Generator[str, None, None]:
    """
    Stream an improved/updated policy document incorporating latest standards.
    Optimized for speed: parallel web search with short timeout, focused prompt
    that outputs ONLY the updated policy (no separate analysis).
    """
    from langchain_core.messages import SystemMessage, HumanMessage

    # Parallel: web search + RAG + org patterns simultaneously
    search_results = ""
    rag_context = ""
    org_patterns = ""

    first_line = policy_text.split("\n")[0].replace("#", "").strip()

    def _do_searches():
        nonlocal search_results
        try:
            queries = [
                f"{first_line} UAE NESA compliance 2025 2026",
                f"{first_line} ISO 27001 2022 best practice",
            ]
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                futures = {executor.submit(_run_search_with_timeout, q, 5): q for q in queries}
                snippets = []
                for future in concurrent.futures.as_completed(futures, timeout=8):
                    result = future.result() or ""
                    if result.strip():
                        snippets.append(result[:600])
            if snippets:
                search_results = "\n".join(snippets)
        except Exception:
            pass

    def _do_rag():
        nonlocal rag_context
        rag_context = _get_rag_context(first_line, k=4)

    def _do_org():
        nonlocal org_patterns
        org_patterns = _learn_org_patterns()

    # Run all three in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pool.submit(_do_searches)
        pool.submit(_do_rag)
        pool.submit(_do_org)
        pool.shutdown(wait=True)

    # Build a focused prompt — output ONLY the updated policy, no analysis
    user_content = (
        f"[ORIGINAL POLICY TO IMPROVE]\n{policy_text[:8000]}\n\n"
    )
    if rag_context:
        user_content += f"[RELATED CORPORATE POLICIES]\n{rag_context[:2000]}\n\n"
    if org_patterns:
        user_content += f"[ORGANISATION PATTERNS]\n{org_patterns[:1500]}\n\n"
    if search_results:
        user_content += f"[LATEST STANDARDS RESEARCH]\n{search_results[:1500]}\n\n"

    user_content += (
        f"OUTPUT ONLY the improved, updated version of this policy. "
        f"DO NOT output analysis or commentary — just the complete updated policy document. "
        f"Incorporate the latest regulatory requirements, fix any compliance gaps, "
        f"strengthen weak areas, and ensure alignment with UAE NESA, ISO 27001:2022, "
        f"and UAE PDPL standards. Keep the same section structure (## numbered sections) "
        f"and formal tone. Use markdown formatting."
    )

    msgs = [SystemMessage(content=_RENEWAL_SYSTEM), HumanMessage(content=user_content)]
    llm = _get_llm()
    try:
        for chunk in llm.stream(msgs):
            text = chunk.content
            if text:
                yield text
    except Exception as exc:
        logger.error("Policy renewal stream error: %s", exc)
        yield "\n\n[Renewal Agent Error: Unable to process renewal. Please try again.]"

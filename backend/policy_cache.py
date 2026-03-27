"""
policy_cache.py — Pre-analysis and caching of all corporate policies.

Loads all policy PDFs on first access, extracts text and structure,
and caches the analysis for instant retrieval during expert chat.
Optionally runs LLM-powered deep analysis in the background.
"""

import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .config import settings, POLICY_LIST

logger = logging.getLogger(__name__)

# ── Singleton cache ─────────────────────────────────────────────────────────

_cache: dict = {}
_cache_status: dict = {
    "loaded": False,
    "loading": False,
    "policies_cached": 0,
    "last_loaded": None,
    "error": None,
}
_cache_lock = threading.Lock()


def get_cache_status() -> dict:
    return dict(_cache_status)


def get_cached_policies() -> dict:
    """Return the full policy cache. Triggers loading if not yet loaded."""
    if not _cache_status["loaded"] and not _cache_status["loading"]:
        _load_all_policies()
    return _cache


def get_policy_summary(name: str) -> Optional[dict]:
    """Get cached analysis for a single policy by name (fuzzy match)."""
    cache = get_cached_policies()
    name_lower = name.lower()
    for key, data in cache.items():
        if name_lower in key.lower() or key.lower() in name_lower:
            return data
    return None


def search_cache(query: str, max_results: int = 5) -> list[dict]:
    """Fast keyword search across all cached policy text and sections."""
    cache = get_cached_policies()
    query_lower = query.lower()
    results = []
    for name, data in cache.items():
        score = 0
        matches = []
        # Check policy name
        if query_lower in name.lower():
            score += 10
        # Check sections
        for sec in data.get("sections", []):
            sec_text = f"{sec.get('title', '')} {sec.get('content', '')}".lower()
            if query_lower in sec_text:
                score += 3
                matches.append(sec.get("title", ""))
        # Check full text
        full_text = data.get("full_text", "").lower()
        count = full_text.count(query_lower)
        score += count
        if score > 0:
            results.append({
                "policy": name,
                "score": score,
                "sections_matched": matches[:3],
                "section_count": len(data.get("sections", [])),
            })
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:max_results]


def get_all_summaries_text() -> str:
    """Return a compact text summary of all policies for LLM context injection."""
    cache = get_cached_policies()
    if not cache:
        return "Policy cache not yet loaded."
    parts = []
    for name, data in cache.items():
        sections = data.get("sections", [])
        sec_titles = ", ".join(s.get("title", "") for s in sections[:8])
        word_count = data.get("word_count", 0)
        parts.append(f"- {name} ({word_count} words): Sections: {sec_titles}")
    return "\n".join(parts)


# ── Loading and parsing ─────────────────────────────────────────────────────

def _extract_pdf_text(filepath: str) -> str:
    """Extract all text from a PDF file."""
    try:
        from langchain_community.document_loaders import PyPDFLoader
        loader = PyPDFLoader(filepath)
        pages = loader.load()
        return "\n\n".join(p.page_content for p in pages)
    except Exception as exc:
        logger.warning("Failed to extract text from %s: %s", filepath, exc)
        return ""


def _parse_sections(text: str) -> list[dict]:
    """Parse policy text into structured sections using regex."""
    sections = []
    # Match patterns like "1.0 Purpose", "2.0 Scope", "## 3.0 Definitions"
    pattern = re.compile(
        r"(?:^#{1,3}\s+)?(\d+(?:\.\d+)*)\s{1,4}([A-Z][^\n]{2,80})",
        re.MULTILINE,
    )
    matches = list(pattern.finditer(text))
    for i, match in enumerate(matches):
        number = match.group(1)
        title = match.group(2).strip().rstrip(".")
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()[:2000]  # Cap content
        sections.append({
            "number": number,
            "title": title,
            "content": content,
            "word_count": len(content.split()),
        })
    return sections


def _extract_metadata(text: str, filename: str) -> dict:
    """Extract document metadata from policy text."""
    meta = {"filename": filename}
    # Try to find document ID
    doc_id_match = re.search(r"(ASH-IT-POL-\d+)", text)
    if doc_id_match:
        meta["doc_id"] = doc_id_match.group(1)
    # Try to find issue/revision
    issue_match = re.search(r"Issue[:\s]+(\d+)", text, re.IGNORECASE)
    if issue_match:
        meta["issue"] = issue_match.group(1)
    rev_match = re.search(r"Rev(?:ision)?[:\s]+(\d+)", text, re.IGNORECASE)
    if rev_match:
        meta["revision"] = rev_match.group(1)
    # Classification
    if "INTERNAL" in text.upper():
        meta["classification"] = "INTERNAL"
    elif "CONFIDENTIAL" in text.upper():
        meta["classification"] = "CONFIDENTIAL"
    return meta


def _load_all_policies() -> None:
    """Load and parse all policy PDFs into the cache."""
    global _cache
    with _cache_lock:
        if _cache_status["loaded"] or _cache_status["loading"]:
            return
        _cache_status["loading"] = True

    logger.info("Policy Cache: Loading and analyzing all policies...")
    policy_dir = settings.POLICY_DOCS_DIR
    if not os.path.isdir(policy_dir):
        logger.error("Policy Cache: Directory not found: %s", policy_dir)
        _cache_status["loading"] = False
        _cache_status["error"] = f"Directory not found: {policy_dir}"
        return

    new_cache = {}
    pdf_files = list(Path(policy_dir).glob("*.pdf"))
    logger.info("Policy Cache: Found %d PDF files", len(pdf_files))

    for pdf_path in pdf_files:
        try:
            text = _extract_pdf_text(str(pdf_path))
            if not text or len(text) < 50:
                continue
            sections = _parse_sections(text)
            metadata = _extract_metadata(text, pdf_path.name)
            policy_name = pdf_path.stem  # filename without extension

            new_cache[policy_name] = {
                "full_text": text,
                "sections": sections,
                "metadata": metadata,
                "word_count": len(text.split()),
                "section_count": len(sections),
                "cached_at": datetime.now(timezone.utc).isoformat(),
            }
            logger.debug("Policy Cache: Loaded '%s' — %d sections, %d words",
                         policy_name, len(sections), len(text.split()))
        except Exception as exc:
            logger.warning("Policy Cache: Failed to load '%s': %s", pdf_path.name, exc)

    with _cache_lock:
        _cache = new_cache
        _cache_status["loaded"] = True
        _cache_status["loading"] = False
        _cache_status["policies_cached"] = len(new_cache)
        _cache_status["last_loaded"] = datetime.now(timezone.utc).isoformat()
        _cache_status["error"] = None

    logger.info(
        "Policy Cache: Successfully cached %d policies (%d total words)",
        len(new_cache),
        sum(d["word_count"] for d in new_cache.values()),
    )


def init_cache_background() -> None:
    """Start loading the policy cache in a background thread."""
    thread = threading.Thread(target=_load_all_policies, daemon=True, name="policy-cache-loader")
    thread.start()
    logger.info("Policy Cache: Background loading started")

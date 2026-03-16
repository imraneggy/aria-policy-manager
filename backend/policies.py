"""
policies.py — All policy API routes with SSE streaming support.
"""

import json
import html
import logging
import os
import tempfile
from typing import Generator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.background import BackgroundTasks
from pydantic import BaseModel

from .auth import verify_token
from .config import POLICY_LIST
from .agents import (
    stream_chat_response,
    stream_generate_policy,
    stream_review_policy,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/policies", tags=["policies"])


# ── Request / Response models ────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []


class PolicyRequest(BaseModel):
    request: str


class PolicyDraft(BaseModel):
    policy_text: str


# ── SSE helper ───────────────────────────────────────────────────────────────

def _sse_stream(generator: Generator) -> Generator[str, None, None]:
    """
    Wraps a text generator into SSE format.
    Each chunk is emitted as:   data: {"chunk": "..."}
    Terminates with:            data: [DONE]
    """
    try:
        for chunk in generator:
            if chunk:
                payload = json.dumps({"chunk": chunk}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
    except Exception as exc:
        error_payload = json.dumps({"chunk": f"\n\n[Error: {exc}]"})
        yield f"data: {error_payload}\n\n"
    finally:
        yield "data: [DONE]\n\n"


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/list")
def list_policies(current_user: str = Depends(verify_token)):
    """Return the full list of corporate policies."""
    return {"policies": POLICY_LIST, "count": len(POLICY_LIST)}


@router.post("/chat/stream")
def chat_stream(req: ChatRequest, current_user: str = Depends(verify_token)):
    """SSE stream: ARIA expert chat response."""
    history_dicts = [{"role": m.role, "content": m.content} for m in req.history]
    generator = stream_chat_response(req.question, history_dicts)
    return StreamingResponse(
        _sse_stream(generator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/generate/stream")
def generate_stream(req: PolicyRequest, current_user: str = Depends(verify_token)):
    """SSE stream: policy writer agent generates a full policy document."""
    generator = stream_generate_policy(req.request)
    return StreamingResponse(
        _sse_stream(generator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/review/stream")
def review_stream(req: PolicyDraft, current_user: str = Depends(verify_token)):
    """SSE stream: compliance auditor agent reviews a policy draft."""
    generator = stream_review_policy(req.policy_text)
    return StreamingResponse(
        _sse_stream(generator),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/export/docx")
def export_docx(
    req: PolicyDraft,
    background_tasks: BackgroundTasks,
    current_user: str = Depends(verify_token),
):
    """
    Export policy draft as a formatted DOCX file.
    Returns the file directly — uses BackgroundTask to clean up the temp file.
    """
    try:
        import docx as docx_module
        from docx.shared import Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        doc = docx_module.Document()

        # Document title style
        title_para = doc.add_heading("", level=0)
        title_run = title_para.runs[0] if title_para.runs else title_para.add_run("")

        lines = req.policy_text.strip().split("\n")
        first_line = lines[0].lstrip("#").strip() if lines else "IT Policy Document"
        body_lines = lines[1:] if len(lines) > 1 else []

        title_run.text = first_line
        title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

        # Subtitle / organisation
        sub = doc.add_paragraph("Ali & Sons Holding — DIH IT Security Division")
        sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
        sub_run = sub.runs[0]
        sub_run.font.size = Pt(11)
        sub_run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

        doc.add_paragraph("")  # spacer

        # Parse and render body
        current_section = None
        for line in body_lines:
            stripped = line.strip()
            if not stripped:
                if current_section:
                    doc.add_paragraph("")
                continue

            # Section headings (## or ###)
            if stripped.startswith("### "):
                heading_text = stripped[4:].strip()
                doc.add_heading(heading_text, level=3)
                current_section = heading_text
            elif stripped.startswith("## "):
                heading_text = stripped[3:].strip()
                doc.add_heading(heading_text, level=2)
                current_section = heading_text
            elif stripped.startswith("# "):
                heading_text = stripped[2:].strip()
                doc.add_heading(heading_text, level=1)
                current_section = heading_text
            elif stripped.startswith("- ") or stripped.startswith("* "):
                p = doc.add_paragraph(stripped[2:], style="List Bullet")
            elif len(stripped) > 1 and stripped[0].isdigit() and stripped[1] in (".", ")"):
                p = doc.add_paragraph(stripped[2:].strip(), style="List Number")
            else:
                doc.add_paragraph(stripped)

        # Save to temp file
        fd, tmp_path = tempfile.mkstemp(suffix=".docx")
        os.close(fd)
        doc.save(tmp_path)

        background_tasks.add_task(os.unlink, tmp_path)

        return FileResponse(
            path=tmp_path,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename="AliAndSons_IT_Policy.docx",
        )
    except Exception as exc:
        logger.error("DOCX export error: %s", exc)
        raise HTTPException(status_code=500, detail=f"DOCX export failed: {exc}")


@router.post("/export/pdf")
def export_pdf(
    req: PolicyDraft,
    background_tasks: BackgroundTasks,
    current_user: str = Depends(verify_token),
):
    """
    Export policy draft as a styled PDF.
    Uses pdfkit + wkhtmltopdf. Returns the file directly.
    """
    try:
        import pdfkit

        safe_text = html.escape(req.policy_text)

        # Convert markdown-like headings to HTML
        html_lines = []
        for line in safe_text.split("\n"):
            stripped = line.strip()
            if stripped.startswith("### "):
                html_lines.append(f"<h3>{stripped[4:]}</h3>")
            elif stripped.startswith("## "):
                html_lines.append(f"<h2>{stripped[3:]}</h2>")
            elif stripped.startswith("# "):
                html_lines.append(f"<h1>{stripped[2:]}</h1>")
            elif stripped.startswith("- ") or stripped.startswith("* "):
                html_lines.append(f"<li>{stripped[2:]}</li>")
            elif stripped == "":
                html_lines.append("<br>")
            else:
                html_lines.append(f"<p>{stripped}</p>")

        body_html = "\n".join(html_lines)

        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
  body {{
    font-family: 'IBM Plex Sans', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.6;
    color: #1a202c;
    margin: 40px 50px;
  }}
  .header {{
    border-bottom: 3px solid #1a56db;
    padding-bottom: 16px;
    margin-bottom: 28px;
  }}
  .org-name {{
    font-size: 10pt;
    color: #6b7280;
    margin-top: 4px;
  }}
  h1 {{ font-size: 18pt; color: #1a56db; margin-top: 24px; margin-bottom: 8px; }}
  h2 {{ font-size: 14pt; color: #1e3a8a; margin-top: 20px; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }}
  h3 {{ font-size: 12pt; color: #1e40af; margin-top: 16px; margin-bottom: 4px; }}
  p {{ margin: 6px 0; }}
  li {{ margin: 3px 0 3px 20px; }}
  .footer {{
    margin-top: 40px;
    border-top: 1px solid #e5e7eb;
    padding-top: 10px;
    font-size: 9pt;
    color: #9ca3af;
    text-align: center;
  }}
</style>
</head>
<body>
<div class="header">
  <div class="org-name">Ali &amp; Sons Holding &mdash; DIH IT Security Division &mdash; Abu Dhabi, UAE</div>
  <div class="org-name">Classification: INTERNAL | Generated by ARIA Policy Manager</div>
</div>
{body_html}
<div class="footer">
  This document was generated by ARIA &mdash; AI-Powered IT Policy Manager for Ali &amp; Sons Holding.
  Always validate against current UAE NESA and ISO 27001:2022 standards before official publication.
</div>
</body>
</html>"""

        fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd)

        pdfkit.from_string(html_content, tmp_path)
        background_tasks.add_task(os.unlink, tmp_path)

        return FileResponse(
            path=tmp_path,
            media_type="application/pdf",
            filename="AliAndSons_IT_Policy.pdf",
        )
    except Exception as exc:
        logger.error("PDF export error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"PDF export failed. Ensure wkhtmltopdf is installed: {exc}",
        )

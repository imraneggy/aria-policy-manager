# ARIA Operations Guide

Day-2 operations reference for running the ARIA AI IT Policy Manager.

## 1. Daily Operations

### Health Checks

```bash
# Backend API
curl -sS http://localhost:8000/docs

# Ollama LLM
curl -sS http://localhost:11434/api/tags

# Frontend
curl -sS http://localhost:3000
```

### Admin Workflow

1. Login at `http://localhost:3000`
2. Check autonomous monitor status in Settings
3. Use Expert Chat for ad-hoc policy questions
4. Generate new policies via Policy Generator
5. Review generated policies with Compliance Reviewer
6. Export approved policies as DOCX or PDF

## 2. Autonomous Monitoring Agent

- Runs every 6 hours via APScheduler
- Searches 8 regulatory topics via DuckDuckGo
- LLM fact-checks and filters results
- Auto-ingests relevant updates into ChromaDB

**Check status:** Settings page > Monitoring Status

**Force manual run:** Call `POST /api/admin/secure/monitoring-status` or restart backend

## 3. Policy Knowledge Base Management

### Adding New Policies

1. Place PDF files in `POLICY_DOCS_DIR` (default: `backend/policy_docs/`)
2. Restart backend to trigger automatic ingestion
3. Verify via Expert Chat: ask about the new policy topic

### Checking RAG Health

```python
# From backend environment
from backend.rag import get_collection_stats
print(get_collection_stats())
```

## 4. User Management

### Create Admin User
Default admin is created from `.env` on first startup.

### Change Password
Settings page > Change Password (requires current password)

### Password Recovery
Settings page > Forgot Password > Security Question

## 5. Export Workflow

| Format | Endpoint | Notes |
|--------|----------|-------|
| DOCX | `/api/admin/policies/export/docx` | Always available |
| PDF | `/api/admin/policies/export/pdf` | Requires wkhtmltopdf |

## 6. Backup

### Critical Data
- `backend/admin.db` — user credentials and security Q&A
- `backend/chroma_db/` — RAG vector database
- `.env` — configuration and secrets
- `backend/policy_docs/` — source policy PDFs

### Backup Command
```bash
tar -czf aria-backup-$(date +%Y%m%d).tar.gz \
  backend/admin.db \
  backend/chroma_db/ \
  .env \
  backend/policy_docs/
```

## 7. Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Chat returns generic response | RAG has no context | Add PDFs and restart backend |
| Policy generation timeout | LLM too slow | Use `llama3.2:1b` model |
| PDF export fails | wkhtmltopdf missing | Install wkhtmltopdf or use DOCX |
| Session expired suddenly | JWT 60-min default | Re-login; SessionWarning alerts before expiry |
| Monitor shows no updates | DuckDuckGo rate limit | Wait and retry; check backend logs |
| Login rate limited | 5 attempts exceeded | Wait 300 seconds |

## 8. Security Operations

- Rotate `JWT_SECRET` periodically
- Review audit logs in `backend/audit.py` output
- Keep `.env` out of version control
- Restrict CORS origins for production deployment
- Back up ChromaDB before system updates
- Monitor autonomous agent for ingestion anomalies

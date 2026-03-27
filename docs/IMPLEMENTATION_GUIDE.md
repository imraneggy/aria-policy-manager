# ARIA Implementation Guide

Step-by-step guide to deploy the ARIA AI IT Policy Manager from scratch.

## 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Python | 3.11+ | Runtime |
| Node.js | 18+ | Frontend build |
| Ollama | latest | Local LLM server |
| wkhtmltopdf | latest | PDF export (optional) |

Hardware minimum: 8 GB RAM (16 GB recommended for stable LLM inference).

## 2. Clone and Configure

```bash
git clone https://github.com/imraneggy/aria-policy-manager.git
cd aria-policy-manager
cp .env.example .env
```

Edit `.env` with:
- `JWT_SECRET` — strong random key for token signing
- `JWT_ALGORITHM` — `HS256` (default)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — first admin credentials
- `OLLAMA_MODEL` — `llama3.2:1b` (default)
- `EMBEDDING_MODEL` — `nomic-embed-text`

## 3. Ollama Setup

```bash
ollama serve
ollama pull llama3.2:1b
ollama pull nomic-embed-text
```

Verify:
```bash
ollama list
curl http://localhost:11434/api/tags
```

## 4. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

pip install -r ../requirements.txt

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

On first launch:
- SQLite database initialised (`admin.db`)
- Default admin user created from `.env` credentials
- RAG ingestion starts if policy PDFs are in `POLICY_DOCS_DIR`
- Autonomous monitoring agent starts (6-hour cycle)

Verify: `http://localhost:8000/docs` (Swagger UI)

## 5. RAG Knowledge Base Ingestion

Place corporate policy PDFs in the configured `POLICY_DOCS_DIR` (default: `./policy_docs`).

The backend automatically ingests these into ChromaDB on startup. To force re-ingestion:

```python
from backend.rag import ingest_documents
ingest_documents()
```

Current deployment includes 26 corporate IT security policies covering:
- Access Control, Cloud Security, Data Classification
- Incident Management, Risk Management, Disaster Recovery
- AI/LLM Acceptable Use, Logging and Monitoring
- And more

## 6. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Login with admin credentials from `.env`.

## 7. Access Points

| Service | URL | Notes |
|---------|-----|-------|
| Frontend | http://localhost:3000 | Next.js SSR dashboard |
| Backend API | http://localhost:8000 | FastAPI server |
| Swagger Docs | http://localhost:8000/docs | Interactive API docs |
| Ollama | http://localhost:11434 | LLM server |

## 8. Post-Deployment Validation

- [ ] Admin login works at `/`
- [ ] Expert Chat responds with RAG-grounded answers at `/dashboard/chat`
- [ ] Policy Generator produces structured output at `/dashboard/generate`
- [ ] Compliance Reviewer returns scorecard for generated policies
- [ ] DOCX / PDF export downloads correctly
- [ ] Settings page loads monitoring status at `/dashboard/settings`
- [ ] Autonomous monitor shows last run timestamp
- [ ] Session expiry warning appears before timeout
- [ ] Theme toggle (dark/light) works

## 9. Production Considerations

- Use Gunicorn or Uvicorn workers for production (`uvicorn main:app --workers 4`)
- Place behind a reverse proxy (Nginx) with HTTPS
- Rotate `JWT_SECRET` on deployment
- Configure `CORS_ORIGINS` to restrict allowed frontends
- Back up ChromaDB data directory and SQLite database
- Monitor the autonomous agent logs for ingestion failures

## 10. Troubleshooting

**Ollama 404 / Model Not Found**
- Pull the configured model: `ollama pull llama3.2:1b`
- Verify with `ollama list`

**RAG returns no context**
- Ensure PDFs are in `POLICY_DOCS_DIR`
- Run ingestion manually and check ChromaDB count

**JWT token expired**
- Default expiry is 60 minutes
- Re-login from the login page
- SessionWarning component alerts before expiry

**PDF export fails**
- Install `wkhtmltopdf` and ensure it's in PATH
- Falls back to DOCX if PDF generation fails

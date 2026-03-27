# ARIA Architecture Reference

## 1. System Overview

ARIA is a local-first, air-gapped AI platform for enterprise IT policy lifecycle management. It combines multi-agent RAG orchestration with compliance framework mapping to automate policy generation, review, and regulatory monitoring.

## 2. Runtime Topology

```
                         +-------------------+
                         |    Browser        |
                         |  (Next.js SSR)    |
                         +--------+----------+
                                  |
                         +--------v----------+
                         |  Next.js 16       |
                         |  React 19         |
                         |  Tailwind CSS 4   |
                         |  TypeScript 5     |
                         |  Port: 3000       |
                         +--------+----------+
                                  | API Proxy (/api -> :8000)
                         +--------v----------+
                         |  FastAPI          |
                         |  Uvicorn          |
                         |  Port: 8000       |
                         +--+-----+------+--+
                            |     |      |
                   +--------+  +--+--+  +--------+
                   | ChromaDB| |SQLite|  | Ollama |
                   | (RAG)   | |(Auth)|  | (LLM)  |
                   | Vector  | |Users |  | :11434 |
                   +--------+  +-----+  +--------+
```

## 3. Multi-Agent Architecture

### Agent Orchestration Flow

```
User Request
     |
     v
+----+----+
| FastAPI  | --- JWT Auth Check
| Router   |
+----+----+
     |
     v (SSE streaming)
+----+----------+
| Agent Router  |
+----+----+-----+
     |    |     |
     v    v     v
  ARIA  Policy  Compliance
  Expert Writer Reviewer
     |    |     |
     v    v     v
  +------+------+
  |   ChromaDB  | <-- RAG Context (top-5 chunks)
  |   Retrieval |
  +------+------+
         |
         v
  +------+------+
  |    Ollama   | <-- Local LLM (llama3.2:1b)
  |  Inference  |
  +-------------+
```

### Agent Details

| Agent | Trigger | RAG | Web Search | Output |
|-------|---------|-----|------------|--------|
| ARIA Expert | `/api/admin/policies/chat/stream` | Yes (top-5) | No | Streaming chat response |
| Policy Writer | `/api/admin/policies/generate/stream` | Yes (top-5) | Yes (DuckDuckGo) | Structured policy document |
| Compliance Reviewer | `/api/admin/policies/review/stream` | Yes | No | Compliance scorecard |
| Autonomous Monitor | APScheduler (6h) | Ingests results | Yes (8 queries) | Auto-ingested updates |

## 4. Data Layer

### ChromaDB (Vector Store)
- **Collection**: `policy_documents`
- **Embeddings**: `nomic-embed-text` via Ollama
- **Chunk size**: Configurable (default 1000 tokens)
- **Retrieval**: Top-5 similarity search per query
- **Persistence**: Local filesystem (`backend/chroma_db/`)

### SQLite (Auth)
- **Database**: `backend/admin.db`
- **Tables**: `users` (username, bcrypt hash, security Q&A)
- **Sessions**: JWT tokens (HS256, 60-min expiry)

### Policy Cache
- **Module**: `backend/policy_cache.py`
- **Purpose**: Reduces redundant LLM calls for repeated queries
- **TTL**: Configurable

## 5. Frontend Architecture

### Pages and Routing

| Route | Page | Features |
|-------|------|----------|
| `/` | Login | JWT auth, theme toggle |
| `/dashboard` | Layout | Auth guard, sidebar, session management |
| `/dashboard/overview` | Overview | Dashboard summary page |
| `/dashboard/chat` | Expert Chat | SSE streaming, conversation history |
| `/dashboard/generate` | Policy Generator | Generate + review + export (DOCX/PDF) |
| `/dashboard/settings` | Settings | Password change, security Q&A, monitoring status |

### Key Components

| Component | Purpose |
|-----------|---------|
| `Sidebar.tsx` | Navigation, policy library, theme toggle |
| `SessionWarning.tsx` | JWT expiry countdown warning |
| `Toast.tsx` | Toast notification system |

### Libraries

| Library | Purpose |
|---------|---------|
| `session.ts` | JWT decode, expiry tracking, auto-logout |
| `shortcuts.ts` | Keyboard shortcut bindings |
| `theme.tsx` | Dark/light theme provider and persistence |
| `api.ts` | Fetch wrapper, SSE stream reader, error handling |

## 6. Security Architecture

| Layer | Implementation |
|-------|---------------|
| Authentication | JWT (HS256, 60-min expiry, HttpOnly recommended) |
| Password storage | bcrypt via passlib |
| Rate limiting | 5 attempts / 300 seconds per IP |
| User enumeration | Same error response for all auth failures |
| Password recovery | Security question/answer (bcrypt-hashed answer) |
| Session management | Frontend session tracking with expiry warnings |
| Input validation | `backend/validators.py` for all user inputs |
| Audit logging | `backend/audit.py` for admin actions |
| CORS | Configurable allowed origins |
| Data sovereignty | 100% local — no external API calls for AI |

## 7. Compliance Framework Coverage

| Framework | Coverage |
|-----------|----------|
| UAE NESA | National Electronic Security Authority controls |
| ISO 27001:2022 | Annex A controls, ISMS clause mapping |
| UAE PDPL | Federal Decree-Law No. 45 of 2021 |
| NIST CSF 2.0 | All 6 functions: Govern, Identify, Protect, Detect, Respond, Recover |
| CIS Controls v8 | Implementation Groups 1, 2, 3 |
| ADDA | Abu Dhabi Digital Authority guidelines |
| GDPR | General Data Protection Regulation (EU) |
| NIS2 | EU Network and Information Security Directive |
| DORA | Digital Operational Resilience Act |

## 8. Autonomous Monitoring Pipeline

```
Every 6 Hours (APScheduler)
     |
     v
  +--+------+
  |  Scout  | --- 8 DuckDuckGo search queries
  |  Phase  |     (regulatory, compliance, cyber law)
  +--+------+
     |
     v
  +--+---------+
  | Fact-Check | --- LLM validates relevance
  |  Phase     |     (filters noise)
  +--+---------+
     |
     v
  +--+---------+
  | Summarise  | --- LLM generates summary
  |  Phase     |     (structured format)
  +--+---------+
     |
     v
  +--+---------+
  | Ingest     | --- ChromaDB embedding + storage
  |  Phase     |     (auto-expands knowledge base)
  +--+---------+
```

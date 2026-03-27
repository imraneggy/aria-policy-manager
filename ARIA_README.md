<div align="center">

<img src="frontend/public/logo2.png" alt="Ali and Sons" width="180"/>

# ARIA - AI IT Policy Manager

**Enterprise-grade GRC governance platform powered by multi-agent RAG**

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge)
![ChromaDB](https://img.shields.io/badge/ChromaDB-FF6F00?style=for-the-badge)
![Ollama](https://img.shields.io/badge/Ollama-111111?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

*Built for Ali and Sons Holding - DIH IT Security Division, Abu Dhabi, UAE*

</div>

---

## Executive Summary (CISO Brief)

ARIA is a **fully air-gapped, local-first AI platform** that automates IT policy lifecycle management - from generation to compliance review. It eliminates dependency on cloud-based AI services, ensuring **zero data leakage** and full **data sovereignty**.

### Business Value

| Metric | Impact |
|--------|--------|
| **Policy generation time** | Minutes vs. weeks of manual drafting |
| **Compliance coverage** | UAE NESA, ISO 27001:2022, UAE PDPL, NIST CSF 2.0, CIS v8 |
| **Cloud API cost** | **$0** - 100% local LLM processing |
| **Data sovereignty** | Air-gapped - no data leaves the network |
| **Regulatory monitoring** | Autonomous 24/7 scanning with auto-ingestion |

### Compliance Frameworks

- **UAE NESA** - National Electronic Security Authority controls
- **ISO 27001:2022** - Annex A controls, ISMS certification readiness
- **UAE PDPL** - Federal Decree-Law No. 45 of 2021 (Personal Data Protection)
- **NIST CSF 2.0** - Identify, Protect, Detect, Respond, Recover
- **CIS Controls v8** - Implementation Groups 1, 2, 3
- **ADDA** - Abu Dhabi Digital Authority governance guidelines
- **UAE Cybersecurity Law** - Federal Decree-Law No. 2 of 2021

---

## Architecture

```
+----------------------------------------------------------------+
|                        ARIA Platform                            |
+------------------------+---------------------------------------+
|     Frontend           |              Backend                   |
|  +------------------+  |  +----------------------------------+  |
|  |  Next.js 16      |  |  |  FastAPI + Uvicorn               |  |
|  |  React 19        |--+--|                                  |  |
|  |  Tailwind CSS 4  |  |  |  +----------------------------+  |  |
|  |  TypeScript 5    |  |  |  |  Multi-Agent System        |  |  |
|  +------------------+  |  |  |  - ARIA Expert (Chat)      |  |  |
|                        |  |  |  - Policy Writer           |  |  |
|  Pages:                |  |  |  - Compliance Reviewer     |  |  |
|  - Login (JWT Auth)    |  |  |  - Autonomous Monitor      |  |  |
|  - Expert Chat (SSE)   |  |  +----------------------------+  |  |
|  - Policy Generator    |  |                                  |  |
|  - Compliance Review   |  |  +------------+ +------------+   |  |
|  - Admin Settings      |  |  | ChromaDB   | |  SQLite    |   |  |
|                        |  |  | (RAG)      | |  (Users)   |   |  |
|                        |  |  +------------+ +------------+   |  |
|                        |  |         |                         |  |
|                        |  |  +------+------+                  |  |
|                        |  |  |   Ollama    |                  |  |
|                        |  |  | (Local LLM) |                  |  |
|                        |  |  +-------------+                  |  |
|                        |  +----------------------------------+  |
+------------------------+---------------------------------------+
```

---

## Multi-Agent System

ARIA operates with **four specialised AI agents**, each with distinct responsibilities:

### 1. ARIA Master Expert

- **Role**: IT policy Q&A advisor
- **Capabilities**: Answers policy questions grounded in corporate policy library via RAG
- **Context**: Retrieves top-5 relevant document chunks from ChromaDB before responding
- **History**: Maintains last 10 conversation exchanges for coherent dialogue

### 2. Policy Writer Agent

- **Role**: Drafts enterprise-grade IT policies
- **Structure**: ISO/IEC 27002:2022 template (Purpose, Scope, Policy Statement, Roles, Compliance, References)
- **Sources**: RAG context (internal policies) + DuckDuckGo web search (latest regulatory updates)
- **Output**: Complete markdown policy documents with numbered requirements

### 3. Compliance Reviewer Agent

- **Role**: Audits submitted policy drafts against compliance frameworks
- **Output**: Structured compliance scorecard covering NESA Controls, ISO 27001:2022 Alignment, UAE PDPL Compliance, NIST CSF 2.0 Mapping, Critical Gaps, and Approval Recommendation

### 4. Autonomous Monitoring Agent

- **Role**: 24/7 regulatory intelligence gathering
- **Pipeline**: Scout (8 DuckDuckGo queries) then Fact-Checker (LLM validation) then Summariser (ChromaDB ingestion)
- **Schedule**: Every 6 hours via APScheduler
- **Output**: Auto-ingested regulatory updates into the RAG knowledge base

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ | Runtime |
| FastAPI | 0.115+ | Async web framework |
| Uvicorn | 0.34+ | ASGI server |
| LangChain | 0.3+ | LLM orchestration, RAG pipelines |
| ChromaDB | 0.5+ | Vector database (persistent) |
| Ollama | latest | Local LLM server |
| SQLite | built-in | User authentication database |
| APScheduler | 3.10+ | Background job scheduling |
| python-docx | 1.1+ | DOCX policy export |
| pdfkit | 1.0+ | PDF policy export (requires wkhtmltopdf) |
| passlib + bcrypt | latest | Password hashing |
| PyJWT | latest | JWT token management |
| DuckDuckGo Search | latest | Web search integration |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | React framework (SSR/CSR) |
| React | 19.2.3 | UI library |
| TypeScript | 5 | Type-safe JavaScript |
| Tailwind CSS | 4 | Utility-first CSS |

### LLM Configuration

| Parameter | Value |
|-----------|-------|
| Model | llama3.2:1b (configurable) |
| Embeddings | nomic-embed-text |
| Temperature | 0.2 |
| Base URL | http://localhost:11434 |

---

## Project Structure

```
aria-policy-manager/
+-- .env.example              # Environment template
+-- .gitignore                # Git exclusions
+-- README.md                 # This file
+-- requirements.txt          # Root-level Python dependencies
|
+-- backend/
|   +-- __init__.py            # Python package init
|   +-- main.py                # FastAPI entry point + lifespan + middleware
|   +-- config.py              # Pydantic settings + policy library
|   +-- auth.py                # JWT authentication (HS256)
|   +-- database.py            # SQLite user management + bcrypt
|   +-- schemas.py             # Pydantic request/response models
|   +-- policies.py            # Policy API routes + SSE streaming + exports
|   +-- agents.py              # Multi-agent system (ARIA, Writer, Reviewer)
|   +-- rag.py                 # ChromaDB RAG ingestion + retrieval
|   +-- admin_routes.py        # Admin security routes + rate limiting
|   +-- monitor.py             # Autonomous monitoring agent (6h cycle)
|   +-- audit.py               # Audit logging module
|   +-- middleware.py           # Auth / session middleware
|   +-- policy_cache.py        # Policy caching layer
|   +-- validators.py          # Input validation
|   +-- logo_*.png             # Brand assets
|
+-- frontend/
    +-- package.json           # Dependencies
    +-- next.config.ts         # API proxy rewrites
    +-- tsconfig.json          # TypeScript configuration
    +-- public/
    |   +-- logo-mark.png      # Ali and Sons mark (604x604)
    |   +-- logo2.png          # Ali and Sons full logo (820x839)
    +-- src/
        +-- app/
        |   +-- layout.tsx         # Root layout (Sora + JetBrains Mono)
        |   +-- page.tsx           # Login page (JWT auth)
        |   +-- globals.css        # Design system (tokens, components)
        |   +-- dashboard/
        |       +-- layout.tsx         # Dashboard wrapper + auth guard
        |       +-- overview/page.tsx  # Dashboard overview page
        |       +-- chat/page.tsx      # Expert chat (SSE streaming)
        |       +-- generate/page.tsx  # Policy generator + reviewer
        |       +-- settings/page.tsx  # Admin settings + monitoring
        +-- components/
        |   +-- Sidebar.tsx        # Navigation + policy library
        |   +-- SessionWarning.tsx # Session expiry warning
        |   +-- Toast.tsx          # Toast notification component
        +-- lib/
            +-- api.ts             # Fetch wrapper + SSE stream reader
            +-- session.ts         # Session management
            +-- shortcuts.ts       # Keyboard shortcuts
            +-- theme.tsx          # Theme provider (dark/light)
```

---

## Setup and Installation

### Prerequisites

- Python 3.11+
- Node.js 18+ / npm 9+
- [Ollama](https://ollama.com/) installed and running
- wkhtmltopdf (for PDF export)

### Step 1: Clone

```bash
git clone https://github.com/imraneggy/aria-policy-manager.git
cd aria-policy-manager
```

### Step 2: Ollama Setup

```bash
ollama serve
ollama pull llama3.2:1b
ollama pull nomic-embed-text
```

### Step 3: Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

pip install fastapi uvicorn langchain langchain-community chromadb \
  python-jose passlib[bcrypt] python-docx pdfkit apscheduler \
  pydantic-settings duckduckgo-search

cp ../.env.example .env
# Edit .env with your JWT secret and admin credentials

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Step 4: Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Step 5: Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/admin/login | JWT authentication |
| GET | /api/admin/me | Verify token |
| GET | /api/admin/policies/list | List all 25+ corporate policies |
| POST | /api/admin/policies/chat/stream | SSE - Expert chat with RAG |
| POST | /api/admin/policies/generate/stream | SSE - Generate policy document |
| POST | /api/admin/policies/review/stream | SSE - Compliance review scorecard |
| POST | /api/admin/policies/export/docx | Export policy as DOCX |
| POST | /api/admin/policies/export/pdf | Export policy as PDF |
| POST | /api/admin/secure/change-password | Update password |
| POST | /api/admin/secure/set-security-question | Configure recovery Q&A |
| POST | /api/admin/secure/forgot-password | Retrieve security question |
| POST | /api/admin/secure/reset-password | Reset password via Q&A |
| GET | /api/admin/secure/monitoring-status | Autonomous monitor status |

---

## Security Features

- **JWT Authentication** - HS256, 60-minute token expiry
- **Bcrypt Password Hashing** - passlib with bcrypt backend
- **Rate Limiting** - 5 attempts per 300 seconds per IP
- **User Enumeration Prevention** - Same error response for missing user/question
- **Security Question Recovery** - Q&A-based password reset
- **Air-Gapped Operation** - No cloud API calls, no data exfiltration
- **CORS Policy** - Configurable allowed origins

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| SECRET_KEY | JWT signing secret | (required) |
| ADMIN_USERNAME | Default admin username | admin |
| ADMIN_PASSWORD | Default admin password | (required) |
| OLLAMA_MODEL | LLM model name | llama3.2:1b |
| OLLAMA_BASE_URL | Ollama server URL | http://localhost:11434 |
| EMBEDDING_MODEL | Embedding model | nomic-embed-text |
| POLICY_DOCS_DIR | PDF policy directory | ./policy_docs |
| RATE_LIMIT_WINDOW | Rate limit window (seconds) | 300 |
| RATE_LIMIT_MAX | Max attempts per window | 5 |

---

## License

This project is proprietary to Ali and Sons Holding - DIH IT Security Division.

---

<div align="center">

**ARIA** - *AI-Powered Policy Intelligence*

Built by **Imran Batcha** | CISM | AI Security Engineer

[![LinkedIn](https://img.shields.io/badge/LinkedIn-imranbatcha-0077B5?style=flat-square&logo=linkedin)](https://linkedin.com/in/imranbatcha)
[![GitHub](https://img.shields.io/badge/GitHub-imraneggy-100000?style=flat-square&logo=github)](https://github.com/imraneggy)

</div>

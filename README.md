# AI IT Policy Manager (Ali & Sons Holding)

An Open-Source, offline AI-driven Policy Generation and Management Dashboard modeled on LangChain and RAG to comply with UAE NESA/SIA & ISO 27001 standards.

## Architecture
- **Backend**: FastAPI (Python), Langchain, ChromaDB for RAG context, PyJWT for secure admin logins.
- **Frontend**: Next.js (React), Tailwind CSS for a professional dark-themed UI.
- **AI Engine**: Local LLM driven by **Ollama** (Model: `llama3`). No data leaves your machine.

## Features
1. **Admin Login**: Secure login screen (`admin` / `admin` by default).
2. **Master Dashboard**: View all ingested policies.
3. **AI Generation Interface**: Sub-agents available:
   - **Policy Writer Sub-agent**: Uses existing 26 PDF context + Live Web Search (DuckDuckGo) to draft new policies and procedures.
   - **Policy Reviewer Sub-agent**: Formally reviews your generated drafts against NESA / ISO 27001 constraints.
4. **Autonomous Monitoring Agent**: Runs in the background (APScheduler) every 24 hours to automatically scout for new IT changes/regulations online and embeds them into the local vector DB.
5. **PDF/Word Export**: Download generated policies instantly to 📄 `.docx` or 📕 `.pdf`.

## Prerequisites
1. Installed **Python 3.10+** and **Node.js (v18+)**.
2. Installed **Ollama** and pulled the LLaMA3 model:
   ```bash
   ollama pull llama3
   ```
3. Installed **wkhtmltopdf** (required by pdfkit for PDF generation).

## Setup Instructions

### 1. Backend (FastAPI + Langchain RAG)
Open a terminal in the `backend` folder:
```bash
python -m venv venv
.\venv\Scripts\activate
pip install fastapi uvicorn langchain langchain-community langchain-core chromadb pyyaml python-docx pdfkit pydantic-settings python-multipart pyjwt pypdf pycryptodome duckduckgo-search apscheduler langchain-text-splitters
```

# RAG Ingestion (Optional: pre-run by the script to embed the 26 PDFs)
python -c "from backend.rag import ingest_documents; ingest_documents()"

# Start the API server
uvicorn backend.main:app --reload --port 8000
```

### 2. Frontend (Next.js)
Open another terminal in the `frontend` folder:
```bash
npm install
npm run dev
```
Navigate to `http://localhost:3000` to access the application.

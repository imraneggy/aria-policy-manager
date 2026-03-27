"""
rag.py — ChromaDB vector store and PDF ingestion.

All heavy imports (langchain, chromadb) are deferred to function calls
so the main app starts instantly even if these libraries are slow to load.
"""

import os
import logging
from .config import settings

logger = logging.getLogger(__name__)

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

_embeddings = None
_Chroma = None


def _get_chroma_class():
    global _Chroma
    if _Chroma is None:
        try:
            from langchain_chroma import Chroma
            _Chroma = Chroma
        except ImportError:
            from langchain_community.vectorstores import Chroma
            _Chroma = Chroma
    return _Chroma


def get_embeddings():
    global _embeddings
    if _embeddings is None:
        try:
            from langchain_ollama import OllamaEmbeddings
        except ImportError:
            from langchain_community.embeddings import OllamaEmbeddings
        _embeddings = OllamaEmbeddings(
            model=settings.OLLAMA_EMBEDDING_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
        )
    return _embeddings


def get_vector_store():
    Chroma = _get_chroma_class()
    return Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=get_embeddings(),
    )


def ingest_documents() -> int:
    """
    Ingests all PDF documents from POLICY_DOCS_DIR into ChromaDB.
    Returns the number of chunks embedded.
    """
    from langchain_community.document_loaders import PyPDFLoader
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    docs_dir = settings.POLICY_DOCS_DIR
    documents = []

    if not os.path.isdir(docs_dir):
        logger.error(f"Policy docs directory not found: {docs_dir}")
        return 0

    for filename in os.listdir(docs_dir):
        if filename.lower().endswith(".pdf"):
            file_path = os.path.join(docs_dir, filename)
            try:
                loader = PyPDFLoader(file_path)
                loaded_docs = loader.load()
                documents.extend(loaded_docs)
                logger.info(f"Loaded PDF: {filename} ({len(loaded_docs)} pages)")
            except Exception as e:
                logger.warning(f"Failed to load {filename}: {e}")

    if not documents:
        logger.warning("No PDF documents found. Check POLICY_DOCS_DIR in .env")
        return 0

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(documents)
    logger.info(f"Generated {len(chunks)} chunks from {len(documents)} pages")

    Chroma = _get_chroma_class()
    Chroma.from_documents(
        documents=chunks,
        embedding=get_embeddings(),
        persist_directory=CHROMA_PERSIST_DIR,
    )
    logger.info("Documents ingested and persisted to ChromaDB.")
    return len(chunks)

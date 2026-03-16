import os
import logging
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OllamaEmbeddings
from .config import settings

logger = logging.getLogger(__name__)

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

# Lazy-initialised to avoid crashing at import time if Ollama isn't running
_embeddings = None


def get_embeddings() -> OllamaEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = OllamaEmbeddings(
            model=settings.OLLAMA_EMBEDDING_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
        )
    return _embeddings


def get_vector_store() -> Chroma:
    return Chroma(
        persist_directory=CHROMA_PERSIST_DIR,
        embedding_function=get_embeddings(),
    )


def ingest_documents() -> int:
    """
    Ingests all PDF documents from POLICY_DOCS_DIR into ChromaDB.
    Returns the number of chunks embedded.
    """
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

    # Chroma auto-persists in v0.4+; .persist() was removed in v0.5
    Chroma.from_documents(
        documents=chunks,
        embedding=get_embeddings(),
        persist_directory=CHROMA_PERSIST_DIR,
    )
    logger.info("Documents ingested and persisted to ChromaDB.")
    return len(chunks)

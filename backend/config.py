import os
import secrets
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── JWT ───────────────────────────────────────────────────────────────────
    # No insecure default — will raise a clear error if not set in .env
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_MINUTES: int = 60

    # ── Admin ─────────────────────────────────────────────────────────────────
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = ""

    # ── Ollama ────────────────────────────────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2:1b"
    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text"

    # ── Paths ─────────────────────────────────────────────────────────────────
    # Override via env var; defaults to the parent of the project root (Policies ASH/)
    POLICY_DOCS_DIR: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..")
    )

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_WINDOW_SECONDS: int = 300  # 5 minutes
    RATE_LIMIT_MAX_ATTEMPTS: int = 5

    class Config:
        env_file = ".env"

    def validate_secrets(self) -> None:
        """Call this on startup — fails fast with clear messages instead of silent insecure defaults."""
        if not self.JWT_SECRET or self.JWT_SECRET.startswith("CHANGE_ME"):
            raise ValueError(
                "JWT_SECRET is not set. Generate one with:\n"
                "  python -c \"import secrets; print(secrets.token_hex(32))\"\n"
                "Then add it to your .env file."
            )
        if not self.ADMIN_PASSWORD or self.ADMIN_PASSWORD.startswith("CHANGE_ME"):
            raise ValueError(
                "ADMIN_PASSWORD is not set. Set a strong password in your .env file."
            )


settings = Settings()

# ── Policy Directory (displayed in dashboard) ─────────────────────────────────
POLICY_LIST = [
    "AI Tools Usage Policy",
    "Acceptable Use Policy for Large Language Models (LLMs) — Appendix",
    "Acceptable Use Policy for Large Language Models (LLMs)",
    "Acceptable Use Policy",
    "Access Control Policy",
    "Anti-Virus and Patch Management Policy",
    "Cloud Security Policy",
    "Data Backup and Restoration Policy",
    "Data Classification Policy",
    "Data Management Policy",
    "Disaster Recovery Plan Policy",
    "Group E-mail Usage Policy",
    "Group Intranet Policy",
    "Hardware and Software Policy",
    "High-Level Information Security Policy",
    "IT Incident Management Policy",
    "IT Risk Management Policy",
    "IT Services Support and Delivery Policy",
    "IT User Awareness and Training Policy",
    "Logging and Monitoring Policy",
    "Printer Policy",
    "Removable Media Policy",
    "SAP User Management Policy",
    "Server and Network Administration Policy",
    "Social Media Policy Guidelines",
]

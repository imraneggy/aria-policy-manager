"""
audit.py — Persistent audit logging for security-critical events.

Every login attempt, password change, configuration change, and
sensitive API access is recorded in the audit_log SQLite table.
Provides both a logging function and an admin API to query recent logs.
"""

import logging
import time
from datetime import datetime, timezone
from .database import get_db

logger = logging.getLogger(__name__)

# ── Event types ───────────────────────────────────────────────────────────────

EVENT_LOGIN_SUCCESS = "LOGIN_SUCCESS"
EVENT_LOGIN_FAILED = "LOGIN_FAILED"
EVENT_PASSWORD_CHANGED = "PASSWORD_CHANGED"
EVENT_SECURITY_Q_SET = "SECURITY_QUESTION_SET"
EVENT_PASSWORD_RESET = "PASSWORD_RESET"
EVENT_FORGOT_PASSWORD = "FORGOT_PASSWORD_REQUEST"
EVENT_POLICY_INGESTED = "POLICY_INGESTED"
EVENT_POLICY_GENERATED = "POLICY_GENERATED"
EVENT_POLICY_REVIEWED = "POLICY_REVIEWED"
EVENT_RATE_LIMITED = "RATE_LIMITED"
EVENT_TOKEN_EXPIRED = "TOKEN_EXPIRED"
EVENT_EXPORT_DOCX = "EXPORT_DOCX"
EVENT_EXPORT_PDF = "EXPORT_PDF"

# ── Schema init ───────────────────────────────────────────────────────────────

def init_audit_table() -> None:
    """Create audit_log table if it doesn't exist."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                username TEXT DEFAULT '',
                client_ip TEXT DEFAULT '',
                detail TEXT DEFAULT '',
                user_agent TEXT DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp
            ON audit_log (timestamp DESC)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_audit_event
            ON audit_log (event_type)
        """)


# ── Core logging function ─────────────────────────────────────────────────────

def log_event(
    event_type: str,
    username: str = "",
    client_ip: str = "",
    detail: str = "",
    user_agent: str = "",
) -> None:
    """
    Record an audit event to the database.
    Non-blocking: swallows exceptions to avoid disrupting the request.
    """
    try:
        ts = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            conn.execute(
                "INSERT INTO audit_log (timestamp, event_type, username, client_ip, detail, user_agent) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (ts, event_type, username, client_ip, detail[:500], user_agent[:300]),
            )
        logger.info("AUDIT | %s | user=%s | ip=%s | %s", event_type, username, client_ip, detail[:120])
    except Exception as exc:
        logger.warning("Failed to write audit log: %s", exc)


# ── Query logs ────────────────────────────────────────────────────────────────

def get_recent_logs(limit: int = 50, event_type: str | None = None) -> list[dict]:
    """Return most recent audit log entries."""
    try:
        with get_db() as conn:
            if event_type:
                rows = conn.execute(
                    "SELECT id, timestamp, event_type, username, client_ip, detail "
                    "FROM audit_log WHERE event_type = ? ORDER BY id DESC LIMIT ?",
                    (event_type, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT id, timestamp, event_type, username, client_ip, detail "
                    "FROM audit_log ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(row) for row in rows]
    except Exception as exc:
        logger.warning("Failed to read audit logs: %s", exc)
        return []

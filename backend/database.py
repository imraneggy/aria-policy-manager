import sqlite3
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from .config import settings, POLICY_LIST

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
DB_PATH = os.path.join(os.path.dirname(__file__), "admin.db")


@contextmanager
def get_db():
    """Context manager for SQLite connections — ensures proper close on error."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def init_db() -> None:
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                security_question TEXT DEFAULT '',
                security_answer_hash TEXT DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS policy_update_suggestions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                policy_name TEXT NOT NULL,
                suggestion TEXT NOT NULL,
                source_query TEXT DEFAULT '',
                framework TEXT DEFAULT '',
                severity TEXT DEFAULT 'INFO',
                status TEXT DEFAULT 'pending',
                created_at TEXT NOT NULL,
                resolved_at TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS managed_policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                doc_id TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                policy_markdown TEXT NOT NULL DEFAULT '',
                last_audit TEXT DEFAULT '',
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                next_renewal TEXT DEFAULT '',
                renewed_at TEXT DEFAULT '',
                created_by TEXT DEFAULT 'admin',
                department TEXT DEFAULT 'Information Technology'
            )
        """)
        # Create default admin if it doesn't exist
        existing = conn.execute(
            "SELECT username FROM users WHERE username = ?", (settings.ADMIN_USERNAME,)
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (settings.ADMIN_USERNAME, get_password_hash(settings.ADMIN_PASSWORD)),
            )

        # Auto-enroll POLICY_LIST into managed_policies if not already tracked
        existing_titles = {
            row["title"]
            for row in conn.execute("SELECT title FROM managed_policies").fetchall()
        }
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        next_renewal = (datetime.now(timezone.utc) + timedelta(days=365)).strftime("%Y-%m-%d")
        for idx, title in enumerate(POLICY_LIST, start=1):
            if title not in existing_titles:
                doc_id = f"POL-{idx:03d}"
                conn.execute(
                    "INSERT INTO managed_policies "
                    "(title, doc_id, status, policy_markdown, version, created_at, updated_at, "
                    "next_renewal, created_by, department) "
                    "VALUES (?, ?, 'approved', '', 1, ?, ?, ?, 'system', 'Information Technology')",
                    (title, doc_id, now, now, next_renewal),
                )


def get_user(username: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT username, password_hash, security_question, security_answer_hash "
            "FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row:
        return dict(row)
    return None


def update_user_password(username: str, plain_password: str) -> None:
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (get_password_hash(plain_password), username),
        )


def update_security_question(username: str, question: str, answer_plain: str) -> None:
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET security_question = ?, security_answer_hash = ? WHERE username = ?",
            (question, get_password_hash(answer_plain.strip().lower()), username),
        )

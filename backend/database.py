import sqlite3
import os
from contextlib import contextmanager
from passlib.context import CryptContext
from .config import settings

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
        # Create default admin if it doesn't exist
        existing = conn.execute(
            "SELECT username FROM users WHERE username = ?", (settings.ADMIN_USERNAME,)
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (settings.ADMIN_USERNAME, get_password_hash(settings.ADMIN_PASSWORD)),
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

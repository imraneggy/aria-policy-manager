"""
admin_routes.py — Security admin routes with in-memory rate limiting.
"""

import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status

from .auth import verify_token
from .config import settings
from .database import get_user, update_user_password, update_security_question, verify_password
from .monitor import monitoring_state
from .schemas import (
    ChangePasswordRequest,
    SetSecurityQuestionRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/secure", tags=["security"])

# ── In-memory rate limiter ────────────────────────────────────────────────────
# Maps a string key (IP or IP+username) to a list of request timestamps.
_rate_limit_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(key: str) -> None:
    """
    Raises HTTP 429 if the key has exceeded RATE_LIMIT_MAX_ATTEMPTS
    within the last RATE_LIMIT_WINDOW_SECONDS.
    Automatically purges expired timestamps on every call.
    """
    now = time.monotonic()
    window = settings.RATE_LIMIT_WINDOW_SECONDS
    max_attempts = settings.RATE_LIMIT_MAX_ATTEMPTS

    # Purge timestamps outside the window
    _rate_limit_store[key] = [
        ts for ts in _rate_limit_store[key] if now - ts < window
    ]

    if len(_rate_limit_store[key]) >= max_attempts:
        logger.warning("Rate limit hit for key: %s", key)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Too many attempts. Please wait "
                f"{window // 60} minute(s) before trying again."
            ),
        )

    _rate_limit_store[key].append(now)


def _get_client_ip(request: Request) -> str:
    """Extract the best available client IP from the request."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/monitoring-status")
def get_monitoring_status(current_user: str = Depends(verify_token)):
    """Return the current state of the autonomous monitoring agent."""
    return monitoring_state


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: str = Depends(verify_token),
):
    """Change the admin password. Requires the old password for verification."""
    user_db = get_user(current_user)
    if not user_db:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_password(req.old_password, user_db["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters.",
        )

    update_user_password(current_user, req.new_password)
    logger.info("Password changed for user: %s", current_user)
    return {"message": "Password updated successfully."}


@router.post("/set-security-question")
def set_security_question(
    req: SetSecurityQuestionRequest,
    current_user: str = Depends(verify_token),
):
    """Set or update the security question and answer for password recovery."""
    if not req.question.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security question cannot be empty.",
        )
    if not req.answer.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Security answer cannot be empty.",
        )

    update_security_question(current_user, req.question.strip(), req.answer.strip())
    logger.info("Security question updated for user: %s", current_user)
    return {"message": "Security question configured successfully."}


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, request: Request):
    """
    Returns the user's security question.
    Rate-limited by IP. Does not reveal whether the username exists
    (returns same response shape in both cases to prevent user enumeration).
    """
    client_ip = _get_client_ip(request)
    _check_rate_limit(f"forgot:{client_ip}")

    user_db = get_user(req.username)

    # Always return the same error to prevent user enumeration
    if not user_db or not user_db.get("security_question"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No security question is configured for this account. "
                   "Contact your system administrator.",
        )

    return {"question": user_db["security_question"]}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, request: Request):
    """
    Reset password using the security answer.
    Rate-limited by IP + username combination.
    """
    client_ip = _get_client_ip(request)
    _check_rate_limit(f"reset:{client_ip}:{req.username}")

    user_db = get_user(req.username)

    if not user_db:
        # Don't reveal that user doesn't exist
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect security answer.",
        )

    if not user_db.get("security_answer_hash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No security question is configured for this account.",
        )

    if not verify_password(req.security_answer.strip().lower(), user_db["security_answer_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect security answer.",
        )

    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters.",
        )

    update_user_password(req.username, req.new_password)
    logger.info("Password reset via security question for user: %s", req.username)
    return {"message": "Password reset successfully. You may now log in."}

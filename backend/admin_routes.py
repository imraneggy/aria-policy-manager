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
from .audit import (
    log_event, get_recent_logs,
    EVENT_PASSWORD_CHANGED, EVENT_SECURITY_Q_SET,
    EVENT_PASSWORD_RESET, EVENT_FORGOT_PASSWORD, EVENT_RATE_LIMITED,
)
from .validators import validate_password_strength

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
    """Extract the client IP from the request.
    Uses request.client.host directly — never trusts X-Forwarded-For
    to prevent rate-limit bypass via header spoofing.
    """
    return request.client.host if request.client else "unknown"


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/monitoring-status")
def get_monitoring_status(current_user: str = Depends(verify_token)):
    """Return the current state of the autonomous monitoring agent."""
    return monitoring_state


@router.post("/monitoring-run")
def trigger_monitoring(current_user: str = Depends(verify_token)):
    """Manually trigger a monitoring cycle (runs in background thread)."""
    from .monitor import trigger_monitoring_now
    result = trigger_monitoring_now()
    if result == "already_running":
        return {"status": "already_running", "message": "A monitoring cycle is already in progress."}
    return {"status": "started", "message": "Monitoring cycle started in background."}


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    request: Request,
    current_user: str = Depends(verify_token),
):
    """Change the admin password. Requires the old password for verification."""
    client_ip = _get_client_ip(request)
    user_db = get_user(current_user)
    if not user_db:
        raise HTTPException(status_code=404, detail="User not found.")

    if not verify_password(req.old_password, user_db["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    pwd_error = validate_password_strength(req.new_password)
    if pwd_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pwd_error)

    update_user_password(current_user, req.new_password)
    log_event(EVENT_PASSWORD_CHANGED, username=current_user, client_ip=client_ip)
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
    log_event(EVENT_SECURITY_Q_SET, username=current_user)
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
    log_event(EVENT_FORGOT_PASSWORD, username=req.username, client_ip=client_ip)

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

    pwd_error = validate_password_strength(req.new_password)
    if pwd_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pwd_error)

    update_user_password(req.username, req.new_password)
    log_event(EVENT_PASSWORD_RESET, username=req.username, client_ip=client_ip)
    logger.info("Password reset via security question for user: %s", req.username)
    return {"message": "Password reset successfully. You may now log in."}


@router.get("/audit-log")
def get_audit_log(
    limit: int = 50,
    event_type: str | None = None,
    current_user: str = Depends(verify_token),
):
    """
    Query the audit log. Returns the most recent security events.
    Only accessible to authenticated admins.
    """
    capped_limit = min(limit, 200)
    logs = get_recent_logs(limit=capped_limit, event_type=event_type)
    return {"logs": logs, "count": len(logs)}


@router.get("/policy-updates")
def get_policy_updates(
    status: str = "pending",
    limit: int = 50,
    current_user: str = Depends(verify_token),
):
    """
    Get policy update suggestions from the Advisor sub-agent.
    Filter by status: pending, accepted, dismissed.
    """
    from .database import get_db

    capped_limit = min(limit, 200)
    try:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT id, policy_name, suggestion, framework, severity, status, created_at "
                "FROM policy_update_suggestions "
                "WHERE status = ? "
                "ORDER BY "
                "  CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'IMPORTANT' THEN 2 ELSE 3 END, "
                "  created_at DESC "
                "LIMIT ?",
                (status, capped_limit),
            ).fetchall()
            suggestions = [dict(row) for row in rows]
    except Exception:
        suggestions = []

    return {"suggestions": suggestions, "count": len(suggestions)}


@router.post("/policy-updates/{suggestion_id}/resolve")
def resolve_policy_update(
    suggestion_id: int,
    action: str = "accepted",
    current_user: str = Depends(verify_token),
):
    """Mark a policy update suggestion as accepted or dismissed."""
    from .database import get_db
    from datetime import datetime, timezone

    if action not in ("accepted", "dismissed"):
        raise HTTPException(status_code=400, detail="Action must be 'accepted' or 'dismissed'.")

    try:
        with get_db() as conn:
            conn.execute(
                "UPDATE policy_update_suggestions SET status = ?, resolved_at = ? WHERE id = ?",
                (action, datetime.now(timezone.utc).isoformat(), suggestion_id),
            )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to update suggestion.")

    return {"message": f"Suggestion {suggestion_id} marked as {action}."}


@router.get("/dashboard-stats")
def get_dashboard_stats(current_user: str = Depends(verify_token)):
    """
    Aggregated analytics for the compliance dashboard.
    Returns event counts, recent activity summary, and system health.
    """
    from .database import get_db
    from .config import POLICY_LIST

    stats = {
        "total_policies": len(POLICY_LIST),
        "events": {},
        "recent_logins": 0,
        "failed_logins": 0,
        "policies_generated": 0,
        "policies_reviewed": 0,
        "exports_total": 0,
    }

    try:
        with get_db() as conn:
            # Count events by type (last 7 days)
            rows = conn.execute(
                "SELECT event_type, COUNT(*) as cnt FROM audit_log "
                "WHERE timestamp >= datetime('now', '-7 days') "
                "GROUP BY event_type"
            ).fetchall()
            for row in rows:
                event_type, count = row[0], row[1]
                stats["events"][event_type] = count
                if event_type == "LOGIN_SUCCESS":
                    stats["recent_logins"] = count
                elif event_type == "LOGIN_FAILED":
                    stats["failed_logins"] = count
                elif event_type == "POLICY_GENERATED":
                    stats["policies_generated"] = count
                elif event_type == "POLICY_REVIEWED":
                    stats["policies_reviewed"] = count
                elif event_type in ("EXPORT_DOCX", "EXPORT_PDF"):
                    stats["exports_total"] += count

            # Total audit events all time
            total = conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()
            stats["total_events"] = total[0] if total else 0
    except Exception:
        pass

    # Pending policy update suggestions
    try:
        with get_db() as conn:
            pending = conn.execute(
                "SELECT COUNT(*) FROM policy_update_suggestions WHERE status = 'pending'"
            ).fetchone()
            stats["pending_updates"] = pending[0] if pending else 0
    except Exception:
        stats["pending_updates"] = 0

    stats["monitoring"] = monitoring_state
    return stats

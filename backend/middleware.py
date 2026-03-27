"""
middleware.py — Security headers and request logging middleware.

Adds OWASP-recommended security headers to every response and
provides request timing for observability.
"""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Injects security headers into every HTTP response.
    Aligned with OWASP Secure Headers Project recommendations.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        elapsed_ms = (time.monotonic() - start) * 1000

        # ── Security headers ──────────────────────────────────────────────
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"  # Disabled per modern guidance; CSP handles this
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"

        # CSP: allow inline styles (needed for React inline styles) and self
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' http://localhost:* ws://localhost:*; "
            "font-src 'self' data:; "
            "frame-ancestors 'none';"
        )

        # HSTS — enforce HTTPS for 1 year (NESA IA-5, ISO 27001 A.8.20)
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

        # ── Observability (server-side only — no timing headers to clients) ──
        if elapsed_ms > 2000:
            logger.warning(
                "Slow request: %s %s — %.0fms",
                request.method,
                request.url.path,
                elapsed_ms,
            )

        return response

"""
main.py — FastAPI application entry point.

Startup sequence:
  1. validate_secrets()  — fail fast if JWT_SECRET / ADMIN_PASSWORD are unset
  2. init_db()           — create SQLite tables and default admin user
  3. start_scheduler()   — launch the 6-hour autonomous monitoring agent
"""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import create_access_token, verify_token
from .config import settings
from .database import get_user, init_db, verify_password
from .schemas import LoginRequest, Token
from .policies import router as policies_router
from .admin_routes import router as admin_router
from .monitor import start_scheduler
from .audit import init_audit_table, log_event, EVENT_LOGIN_SUCCESS, EVENT_LOGIN_FAILED
from .middleware import SecurityHeadersMiddleware

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Lifespan ──────────────────────────────────────────────────────────────────

_scheduler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler

    # 1. Validate critical secrets before anything else
    settings.validate_secrets()
    logger.info("Secrets validated.")

    # 2. Initialise database + audit table
    init_db()
    init_audit_table()
    logger.info("Database initialised (including audit_log table).")

    # 3. ChromaDB ingestion check skipped at startup (done lazily on first query)
    logger.info("ChromaDB will be initialized on first policy query.")

    # 4. Pre-load policy cache in background (non-blocking)
    from .policy_cache import init_cache_background
    init_cache_background()
    logger.info("Policy cache background loading initiated.")

    # 5. Start autonomous monitoring scheduler
    _scheduler = start_scheduler()
    logger.info("AEGIS IT Policy Manager API is ready.")

    yield  # app runs here

    # Graceful shutdown
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Monitoring scheduler stopped.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AEGIS — IT Policy Manager API",
    description="AI-powered IT policy management for Ali & Sons Holding, UAE",
    version="2.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
# SecurityHeaders registered AFTER CORS so it wraps outermost (Starlette reverses order)
app.add_middleware(SecurityHeadersMiddleware)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(policies_router)
app.include_router(admin_router)

# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/api/admin/login", response_model=Token, tags=["auth"])
def login(login_req: LoginRequest, request: Request):
    """Validate admin credentials and return a JWT access token."""
    from .admin_routes import _get_client_ip, _check_rate_limit
    client_ip = _get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")[:200]

    # Rate-limit login attempts by IP
    _check_rate_limit(f"login:{client_ip}")

    user_db = get_user(login_req.username)

    # Use a constant-time comparison path regardless of whether user exists
    if not user_db or not verify_password(login_req.password, user_db["password_hash"]):
        log_event(EVENT_LOGIN_FAILED, username=login_req.username, client_ip=client_ip, user_agent=user_agent)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": login_req.username})
    log_event(EVENT_LOGIN_SUCCESS, username=login_req.username, client_ip=client_ip, user_agent=user_agent)
    logger.info("Login successful: %s", login_req.username)
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/admin/me", tags=["auth"])
def read_me(current_user: str = Depends(verify_token)):
    """Return the authenticated user's info."""
    return {"username": current_user}


@app.get("/", tags=["health"])
def health():
    return {"status": "ok", "service": "AEGIS IT Policy Manager"}


@app.get("/api/health", tags=["health"])
def health_detailed():
    """Detailed health check with component status."""
    from .monitor import monitoring_state
    import os

    chroma_path = os.path.join(os.path.dirname(__file__), "chroma_db")
    return {
        "status": "ok",
        "service": "AEGIS IT Policy Manager",
        "version": "2.1.0",
        "components": {
            "database": "ok",
            "chromadb": "ok" if os.path.isdir(chroma_path) else "not_initialised",
            "monitoring": monitoring_state.get("last_status", "unknown"),
        },
    }

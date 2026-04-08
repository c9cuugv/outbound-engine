import asyncio
from fastapi import FastAPI, Request, Response
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.database import engine
from app.api.v1.auth import router as auth_router
from app.api.v1.leads import router as leads_router
from app.api.v1.lists import router as lists_router
from app.api.v1.campaigns import router as campaigns_router
from app.api.v1.campaign_emails import router as campaign_emails_router
from app.api.v1.tracking import router as tracking_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.websocket import router as websocket_router
from app.api.v1.campaign_chat import router as campaign_chat_router

# ── Rate limiter ──
limiter = Limiter(key_func=get_remote_address)


# ── Security headers middleware ──
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "0"  # modern browsers use CSP instead
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        # Only send HSTS in production (when not on localhost)
        if "localhost" not in request.url.hostname:
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


app = FastAPI(
    title="OutboundEngine",
    description="AI-Powered Cold Outreach Campaign Orchestrator",
    version="0.1.0",
)

# ── Attach rate limiter to app state ──
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# ── Routers ──
app.include_router(auth_router)
app.include_router(leads_router)
app.include_router(lists_router)
app.include_router(campaigns_router)
app.include_router(campaign_emails_router)
app.include_router(tracking_router)
app.include_router(analytics_router)
app.include_router(websocket_router)
app.include_router(campaign_chat_router)


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.get("/health")
async def health():
    checks: dict[str, str] = {}

    # ── Database ──
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # ── Redis ──
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # ── Gemini API key ──
    try:
        if not settings.GEMINI_API_KEY:
            checks["gemini"] = "not configured"
        else:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            # Lightweight probe — list models, no token cost
            models = await asyncio.to_thread(
                lambda: list(genai.list_models())
            )
            checks["gemini"] = "ok" if models else "no models returned"
    except Exception as e:
        checks["gemini"] = f"error: {e}"

    # ── NVIDIA NIM API key ──
    if not settings.NVIDIA_API_KEY:
        checks["nvidia"] = "not configured"
    else:
        checks["nvidia"] = "configured"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": overall, **checks}

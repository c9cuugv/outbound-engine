import os
import sys

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ─── Database ───
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/outbound"
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── Authentication ───
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── CORS ───
    # Comma-separated list of allowed origins, e.g. "https://app.example.com,https://www.example.com"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # ─── AI Providers ───
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    # ─── NVIDIA NIM ───
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    NVIDIA_MODEL: str = "meta/llama-3.1-70b-instruct"

    # Valid options: gemini | groq | claude_code | anthropic_api | nvidia
    RESEARCH_PROVIDER: str = "gemini"
    # Valid options: gemini | groq | claude_code | anthropic_api | nvidia
    EMAIL_GEN_PROVIDER: str = "gemini"
    # Valid options: gemini | groq | claude_code | anthropic_api | nvidia
    SENTIMENT_PROVIDER: str = "gemini"

    # ─── Email Sending ───
    EMAIL_PROVIDER: str = "console"
    RESEND_API_KEY: str = ""
    SENDGRID_API_KEY: str = ""

    # ─── Tracking ───
    TRACKING_DOMAIN: str = ""

    # ─── Reply Detection (IMAP) ───
    IMAP_HOST: str = ""
    IMAP_EMAIL: str = ""
    IMAP_PASSWORD: str = ""

    @property
    def allowed_origins_list(self) -> list[str]:
        """Return ALLOWED_ORIGINS as a parsed list."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# ── Startup security assertions ──
_INSECURE_SECRETS = {"change-me-in-production", "secret", "changeme", ""}
_is_test_env = os.getenv("TESTING", "").lower() in ("1", "true", "yes") or "pytest" in sys.modules
if settings.JWT_SECRET in _INSECURE_SECRETS:
    if _is_test_env:
        print(
            "SECURITY WARNING: JWT_SECRET is set to an insecure default value. "
            "Allowed only because this is a test environment.",
            file=sys.stderr,
        )
    else:
        raise RuntimeError(
            "CRITICAL: JWT_SECRET is set to an insecure default value "
            f"({settings.JWT_SECRET!r}). Set a strong random secret via the "
            "JWT_SECRET environment variable before running in production."
        )

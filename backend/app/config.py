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
    RESEARCH_PROVIDER: str = "gemini"
    EMAIL_GEN_PROVIDER: str = "gemini"
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


settings = Settings()

# ── Startup security assertions ──
_INSECURE_SECRETS = {"change-me-in-production", "secret", "changeme", ""}
if settings.JWT_SECRET in _INSECURE_SECRETS:
    print(
        "SECURITY WARNING: JWT_SECRET is set to an insecure default value. "
        "Set a strong random secret via the JWT_SECRET environment variable "
        "before running in production.",
        file=sys.stderr,
    )

"""Application configuration loaded from environment variables."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./innerbloom.db"
    JWT_SECRET_KEY: str = "change-me-to-a-long-random-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60 * 24 * 7  # 7 days
    # Comma-separated allowed origins (exact matches), e.g. production + local dev.
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:8080,"
        "https://innerbloom-minor-project.vercel.app"
    )
    # Optional regex for additional allowed origins (e.g. Vercel preview deployments).
    # Default allows preview URLs for this Vercel project; override via env if needed.
    CORS_ORIGIN_REGEX: str = r"^https://innerbloom-minor-project[a-z0-9-]*\.vercel\.app$"

    ADMIN_EMAIL: str = "admin@innerbloom.app"
    ADMIN_PASSWORD: str = "Admin123!"
    ADMIN_NAME: str = "InnerBloom Admin"

    # Groq wellness chatbot (server-side only — never expose to the frontend)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    GROQ_API_URL: str = "https://api.groq.com/openai/v1/chat/completions"
    AI_CONTEXT_MESSAGES: int = 10
    AI_MAX_TOKENS: int = 512
    AI_TEMPERATURE: float = 0.7
    AI_TIMEOUT_SECONDS: float = 30.0

    # WebRTC ICE servers for video calls (JSON array). Store STUN/TURN config
    # (including TURN credentials) server-side and serve via authenticated API.
    WEBRTC_ICE_SERVERS: str = ""

    @property
    def ai_configured(self) -> bool:
        return bool(self.GROQ_API_KEY.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def cors_origin_regex(self) -> str | None:
        value = self.CORS_ORIGIN_REGEX.strip()
        return value or None

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()

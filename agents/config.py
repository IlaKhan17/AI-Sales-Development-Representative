"""Central application settings (pydantic-settings).

Fail-fast on the vars the app cannot run without; warn on the rest so a
partially-configured environment still boots (features degrade gracefully).
"""

import logging
import warnings

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_log = logging.getLogger("config")

# Optional vars: missing ones get a one-time warning at startup.
_OPTIONAL_VARS = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
    "SUPABASE_DB_URL",
    "OPENAI_API_KEY",
    "PINECONE_API_KEY",
    "REDIS_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "FRONTEND_URL",
    "SERP_API_KEY",
    "HUNTER_API_KEY",
    "BOT_API_KEY",
    "BRAINTRUST_API_KEY",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Required — fail fast
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str

    # Optional — warn if missing
    SUPABASE_SERVICE_ROLE_KEY: str | None = None
    SUPABASE_JWT_SECRET: str | None = None
    SUPABASE_DB_URL: str | None = None
    OPENAI_API_KEY: str | None = None
    PINECONE_API_KEY: str | None = None
    REDIS_URL: str | None = None
    # Legacy Redis config (kept for backward compat while REDIS_URL rolls out)
    REDIS_HOST: str | None = None
    REDIS_PASSWORD: str | None = None
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str | None = None
    FRONTEND_URL: str | None = "http://localhost:3000"
    SERP_API_KEY: str | None = None
    HUNTER_API_KEY: str | None = None
    BOT_API_KEY: str | None = None
    BRAINTRUST_API_KEY: str | None = None

    # Defaults
    MODEL_NAME: str = "gpt-4.1-mini"
    ALLOWED_ORIGINS: str = "http://localhost:3000"
    ENV: str = "dev"  # dev | prod

    @field_validator("ENV")
    @classmethod
    def _validate_env(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ("dev", "prod"):
            raise ValueError("ENV must be 'dev' or 'prod'")
        return v

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.ENV == "prod"


def _build_settings() -> Settings:
    from dotenv import load_dotenv

    load_dotenv()  # keep parity with previous behavior (loads agents/.env or cwd .env)
    s = Settings()  # raises pydantic ValidationError if required vars missing
    missing = [name for name in _OPTIONAL_VARS if not getattr(s, name)]
    if missing:
        warnings.warn(
            f"Optional environment variables not set: {', '.join(missing)}. "
            "Related features will be degraded or disabled.",
            stacklevel=2,
        )
    return s


settings = _build_settings()

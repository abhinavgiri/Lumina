"""Application configuration, loaded from environment / .env."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Lumina Job Search API"
    environment: str = "development"
    log_level: str = "INFO"

    # CORS — the Next.js frontend origin(s)
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Database: async SQLAlchemy URL. Defaults to local SQLite so the service
    # runs with zero infra; point at Postgres in docker-compose / production.
    database_url: str = "sqlite+aiosqlite:///./lumina_jobs.db"

    # Redis cache (optional — service degrades gracefully if unreachable).
    redis_url: str = "redis://localhost:6379/0"
    cache_ttl_seconds: int = 900  # 15 min

    # Outbound crawl behavior
    request_timeout_seconds: float = 10.0
    max_retries: int = 3
    circuit_breaker_threshold: int = 5  # consecutive failures before a source is tripped
    circuit_breaker_cooldown_seconds: int = 120

    # Rate limiting (per client IP)
    rate_limit_per_minute: int = 60

    # Optional aggregator API keys (kept here for the pluggable adapters that
    # need them; ATS board adapters need none).
    adzuna_app_id: str | None = None
    adzuna_app_key: str | None = None
    adzuna_country: str = "in"
    jooble_api_key: str | None = None

    # Which ATS boards to poll. Format: "provider:company_slug", comma-separated.
    # These are PUBLIC job-board JSON APIs — no scraping, no auth. Verified live.
    # Add/remove companies here; the Lever adapter is supported the same way
    # (e.g. "lever:<company>") for any company hosting a live Lever board.
    ats_boards: str = (
        # Global companies (also have India offices)
        "greenhouse:stripe,greenhouse:databricks,greenhouse:gitlab,"
        "greenhouse:coinbase,greenhouse:figma,greenhouse:mongodb,"
        "greenhouse:rubrik,"
        "ashby:openai,ashby:notion,ashby:linear,ashby:vercel,ashby:mercury,"
        # India-hiring boards (verified live) — give real India coverage.
        "greenhouse:druva,greenhouse:postman,greenhouse:highradius,"
        "lever:meesho,lever:cred,lever:zeta,lever:epifi"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

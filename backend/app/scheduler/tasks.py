"""Background maintenance tasks.

Runnable two ways:
  * `python -m app.scheduler.tasks warm`  — one-shot (cron / manual)
  * as a Celery task (see celery_app.py) for a scheduled worker

Pre-warming the cache for common queries means user-facing searches hit warm
cache and return in milliseconds instead of waiting on live board fetches.
"""
from __future__ import annotations

import asyncio
import sys

from app.cache.redis_cache import cache
from app.core.logging import configure_logging, get_logger
from app.crawler.http_client import close_client
from app.schemas.job import JobSearchRequest
from app.services.search_service import search

configure_logging()
log = get_logger("scheduler")

# Common role queries to keep warm.
WARM_QUERIES = [
    "data engineer",
    "software engineer",
    "machine learning engineer",
    "data analyst",
    "backend engineer",
    "frontend engineer",
    "product manager",
]


async def warm_cache() -> None:
    await cache.connect()
    for q in WARM_QUERIES:
        try:
            resp, _ = await search(JobSearchRequest(title=q, limit=30))
            log.info("warmed", query=q, jobs=resp.total)
        except Exception as exc:  # noqa: BLE001
            log.warning("warm_failed", query=q, error=str(exc))
    await close_client()
    await cache.close()


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "warm"
    if cmd == "warm":
        asyncio.run(warm_cache())
    else:
        print(f"unknown command: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()

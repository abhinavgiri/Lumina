"""Celery app + beat schedule for periodic cache warming / refresh.

Run a worker:  celery -A app.scheduler.celery_app worker --loglevel=info
Run the beat:  celery -A app.scheduler.celery_app beat --loglevel=info

Celery is optional — the same warm task also runs standalone via
`python -m app.scheduler.tasks warm` (used by a plain cron if you'd rather not
run Celery).
"""
from __future__ import annotations

import asyncio

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery("lumina", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(task_serializer="json", accept_content=["json"], timezone="UTC", enable_utc=True)


@celery_app.task(name="warm_cache")
def warm_cache_task() -> str:
    from app.scheduler.tasks import warm_cache

    asyncio.run(warm_cache())
    return "warmed"


celery_app.conf.beat_schedule = {
    "warm-cache-hourly": {
        "task": "warm_cache",
        "schedule": crontab(minute=0),  # top of every hour
    },
}

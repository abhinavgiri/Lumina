"""Redis cache with graceful degradation.

If Redis is unreachable the app keeps working (cache becomes a no-op) — the
service must never hard-fail because a cache is down.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("cache")


class RedisCache:
    def __init__(self) -> None:
        self._client: aioredis.Redis | None = None
        self._healthy = False

    async def connect(self) -> None:
        try:
            self._client = aioredis.from_url(settings.redis_url, decode_responses=True)
            await self._client.ping()
            self._healthy = True
            log.info("cache_connected")
        except Exception as exc:  # noqa: BLE001
            self._healthy = False
            log.warning("cache_unavailable", error=str(exc))

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()

    @staticmethod
    def key(prefix: str, payload: dict[str, Any]) -> str:
        digest = hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]
        return f"lumina:{prefix}:{digest}"

    async def get(self, key: str) -> Any | None:
        if not self._healthy or not self._client:
            return None
        try:
            raw = await self._client.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:  # noqa: BLE001
            log.warning("cache_get_failed", error=str(exc))
            return None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        if not self._healthy or not self._client:
            return
        try:
            await self._client.set(key, json.dumps(value, default=str), ex=ttl or settings.cache_ttl_seconds)
        except Exception as exc:  # noqa: BLE001
            log.warning("cache_set_failed", error=str(exc))


cache = RedisCache()

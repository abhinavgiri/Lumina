"""Shared API dependencies: client identity + in-memory rate limiting."""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

# Sliding-window rate limiter (per client id). In-memory is fine for a single
# instance; swap for a Redis token bucket when running multiple replicas.
_hits: dict[str, deque[float]] = defaultdict(deque)


def client_id(request: Request) -> str:
    """Stable-ish client identity: explicit header, else source IP."""
    return request.headers.get("X-Client-Id") or (request.client.host if request.client else "anonymous")


def rate_limit(request: Request) -> None:
    cid = client_id(request)
    now = time.monotonic()
    window = _hits[cid]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.rate_limit_per_minute:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again shortly.",
        )
    window.append(now)

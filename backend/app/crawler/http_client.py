"""Shared async HTTP client: connection pooling, timeouts, retries, UA rotation.

Deliberately polite — these adapters hit PUBLIC JSON job-board APIs, so this is
about resilience (flaky networks, transient 5xx), not evading protections.
"""
from __future__ import annotations

import random

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("http_client")

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
]

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.request_timeout_seconds),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=30),
            follow_redirects=True,
            headers={"Accept": "application/json"},
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


class RetryableStatusError(Exception):
    """Raised for transient upstream statuses so tenacity retries them."""


@retry(
    retry=retry_if_exception_type((httpx.TransportError, RetryableStatusError)),
    stop=stop_after_attempt(settings.max_retries),
    wait=wait_exponential(multiplier=0.4, min=0.4, max=4),
    reraise=True,
)
async def get_json(url: str, params: dict | None = None, headers: dict | None = None) -> object:
    client = get_client()
    merged = {"User-Agent": random.choice(_USER_AGENTS), **(headers or {})}
    resp = await client.get(url, params=params, headers=merged)
    if resp.status_code in (429, 500, 502, 503, 504):
        raise RetryableStatusError(f"{resp.status_code} from {url}")
    resp.raise_for_status()
    return resp.json()


@retry(
    retry=retry_if_exception_type((httpx.TransportError, RetryableStatusError)),
    stop=stop_after_attempt(settings.max_retries),
    wait=wait_exponential(multiplier=0.4, min=0.4, max=4),
    reraise=True,
)
async def post_json(url: str, json: dict, headers: dict | None = None) -> object:
    client = get_client()
    merged = {"User-Agent": random.choice(_USER_AGENTS), **(headers or {})}
    resp = await client.post(url, json=json, headers=merged)
    if resp.status_code in (429, 500, 502, 503, 504):
        raise RetryableStatusError(f"{resp.status_code} from {url}")
    resp.raise_for_status()
    return resp.json()

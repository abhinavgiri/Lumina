"""FastAPI application entrypoint."""
from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_jobs import router as jobs_router
from app.cache.redis_cache import cache
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.crawler.http_client import close_client
from app.crawler.registry import build_adapters
from app.database.session import init_db

configure_logging()
log = get_logger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    await cache.connect()
    log.info("startup", sources=len(build_adapters()), env=settings.environment)
    yield
    await close_client()
    await cache.close()
    log.info("shutdown")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Unified, resume-aware job search across public ATS job boards.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def timing_and_logging(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    response.headers["X-Process-Time-ms"] = str(int((time.monotonic() - start) * 1000))
    log.info("request", method=request.method, path=request.url.path, status=response.status_code)
    return response


@app.get("/health", tags=["meta"])
async def health() -> dict:
    return {"status": "ok", "sources": len(build_adapters()), "environment": settings.environment}


app.include_router(jobs_router)

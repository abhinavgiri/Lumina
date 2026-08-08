"""The search orchestrator: resume analysis → multi-query fan-out → merge →
dedupe → filter → rank.

Instead of one keyword, the planner derives 10-20 ranked role queries from the
whole resume (skills, stated titles, seniority). Board adapters (Greenhouse /
Ashby / Lever) return a company's full board in one fetch, so multi-query
matching happens locally for free; aggregator adapters (Adzuna / Jooble) run a
real upstream search per query, so they get a small budget of the top queries
to respect their rate limits.

Only search QUERIES leave this machine. Resume text, when provided, is used
locally for planning + ranking and never forwarded upstream.
"""
from __future__ import annotations

import asyncio
import time

from app.cache.redis_cache import cache
from app.core.logging import get_logger
from app.crawler.registry import build_adapters
from app.ranking.dedupe import deduplicate
from app.ranking.ranker import rank_jobs
from app.schemas.job import JobPosting, JobSearchRequest, JobSearchResponse, ScoredJob, SourceStatus
from app.services.filters import apply_filters
from app.services.query_planner import best_query_match, plan_queries

log = get_logger("search")

#: How many of the top planned queries each aggregator actually searches.
#: (Jooble's free tier is 500 requests total, so it gets the smallest budget.)
_AGGREGATOR_BUDGET = {"Jooble": 2, "Adzuna": 4}

#: Minimum title-match score for a board job to count toward a planned role.
_MATCH_THRESHOLD = 0.45


async def search(req: JobSearchRequest) -> tuple[JobSearchResponse, list[dict]]:
    started = time.monotonic()
    plan = plan_queries(req)
    adapters = build_adapters()

    async def run(adapter, query: str):
        cache_key = cache.key(f"src:{adapter.name}", {"q": query, "loc": req.location})
        cached = await cache.get(cache_key)
        if cached is not None:
            return adapter, query, [JobPosting(**j) for j in cached], None, True, 0

        t0 = time.monotonic()
        try:
            jobs = await adapter.search(query, req.location)
            await cache.set(cache_key, [j.model_dump(mode="json") for j in jobs])
            return adapter, query, jobs, None, False, int((time.monotonic() - t0) * 1000)
        except Exception as exc:  # noqa: BLE001
            return adapter, query, [], str(exc)[:160], False, int((time.monotonic() - t0) * 1000)

    # Fan out: boards fetch once (query-less), aggregators get their budget.
    tasks = []
    for a in adapters:
        if a.aggregator:
            budget = _AGGREGATOR_BUDGET.get(a.name, 3)
            for q in plan.queries[:budget]:
                tasks.append(run(a, q))
        else:
            tasks.append(run(a, ""))

    results = await asyncio.gather(*tasks)

    merged: list[JobPosting] = []
    status_by_source: dict[str, SourceStatus] = {}
    crawl_logs: list[dict] = []

    for adapter, query, jobs, error, from_cache, dur in results:
        if adapter.aggregator:
            # Aggregator results were fetched BY a planned query — tag them.
            for j in jobs:
                j.matched_role = j.matched_role or query
        merged.extend(jobs)

        prev = status_by_source.get(adapter.name)
        status_by_source[adapter.name] = SourceStatus(
            name=adapter.name,
            ok=(error is None) or bool(prev and prev.ok),
            count=len(jobs) + (prev.count if prev else 0),
            error=error if error else (prev.error if prev else None),
            from_cache=from_cache and (prev.from_cache if prev else True),
        )
        if not from_cache:
            crawl_logs.append(
                {
                    "source": adapter.name,
                    "query": query or "(full board)",
                    "ok": 1 if error is None else 0,
                    "count": len(jobs),
                    "error": error,
                    "duration_ms": dur,
                }
            )

    # Board jobs came back unfiltered by role — match each against the whole
    # query plan locally and drop anything that fits none of the roles.
    matched: list[JobPosting] = []
    for job in merged:
        if job.matched_role:
            matched.append(job)
            continue
        role, score = best_query_match(job.title, plan.queries)
        if role is not None and score >= _MATCH_THRESHOLD:
            job.matched_role = role
            matched.append(job)

    deduped = deduplicate(matched)
    filtered = apply_filters(deduped, req.filters)
    ranked: list[ScoredJob] = rank_jobs(filtered, req, role_order=plan.queries)[: req.limit]

    took_ms = int((time.monotonic() - started) * 1000)
    response = JobSearchResponse(
        query=plan.queries[0],
        roles_searched=plan.queries,
        total=len(ranked),
        scored=bool(req.resume_text),
        jobs=ranked,
        sources=list(status_by_source.values()),
        took_ms=took_ms,
    )
    log.info(
        "search_done",
        queries=len(plan.queries),
        sources=len(adapters),
        merged=len(merged),
        matched=len(matched),
        returned=len(ranked),
        ms=took_ms,
    )
    return response, crawl_logs

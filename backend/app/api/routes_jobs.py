"""Job search + saved-jobs + history REST endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import client_id, rate_limit
from app.database.repository import (
    CrawlerLogRepository,
    SavedJobRepository,
    SearchHistoryRepository,
)
from app.database.session import get_session
from app.schemas.job import (
    JobPosting,
    JobSearchRequest,
    JobSearchResponse,
    RecentSearchOut,
    SavedJobIn,
    SavedJobOut,
)
from app.services.search_service import search as run_search

router = APIRouter(tags=["jobs"])


@router.post("/jobs/search", response_model=JobSearchResponse, dependencies=[Depends(rate_limit)])
async def search_jobs(
    req: JobSearchRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JobSearchResponse:
    response, crawl_logs = await run_search(req)

    if crawl_logs:
        await CrawlerLogRepository(session).record_many(crawl_logs)
    await SearchHistoryRepository(session).record(
        client_id(request), response.query, req.location, response.total
    )
    return response


@router.get("/jobs/{job_id}", response_model=JobPosting)
async def get_job(
    job_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JobPosting:
    """Return a previously-saved job by id.

    Listings are ephemeral (live from source boards), so a job is retrievable
    here once the user has saved it; otherwise they should re-run the search.
    """
    job = await SavedJobRepository(session).get_payload(client_id(request), job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not in your saved set. Re-run a search to fetch live listings.",
        )
    return job


@router.get("/saved-jobs", response_model=list[SavedJobOut])
async def list_saved(
    request: Request, session: AsyncSession = Depends(get_session)
) -> list[SavedJobOut]:
    rows = await SavedJobRepository(session).list(client_id(request))
    return [
        SavedJobOut(
            id=r.id, job_id=r.job_id, title=r.title, company=r.company,
            apply_url=r.apply_url, note=r.note, saved_at=r.saved_at,
        )
        for r in rows
    ]


@router.post("/save-job", response_model=SavedJobOut, status_code=status.HTTP_201_CREATED)
async def save_job(
    body: SavedJobIn, request: Request, session: AsyncSession = Depends(get_session)
) -> SavedJobOut:
    row = await SavedJobRepository(session).add(client_id(request), body.job, body.note)
    return SavedJobOut(
        id=row.id, job_id=row.job_id, title=row.title, company=row.company,
        apply_url=row.apply_url, note=row.note, saved_at=row.saved_at,
    )


@router.delete("/saved-job/{job_id}")
async def delete_saved(
    job_id: str, request: Request, session: AsyncSession = Depends(get_session)
) -> Response:
    removed = await SavedJobRepository(session).remove(client_id(request), job_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved job not found.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/recent-searches", response_model=list[RecentSearchOut])
async def recent_searches(
    request: Request, session: AsyncSession = Depends(get_session)
) -> list[RecentSearchOut]:
    rows = await SearchHistoryRepository(session).recent(client_id(request))
    return [
        RecentSearchOut(
            id=r.id, query=r.query, location=r.location,
            result_count=r.result_count, searched_at=r.searched_at,
        )
        for r in rows
    ]

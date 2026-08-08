"""Repository pattern over the ORM — services depend on these, not on SQLAlchemy."""
from __future__ import annotations

import json

from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db_models import CrawlerLog, SavedJob, SearchHistory
from app.schemas.job import JobPosting


class SavedJobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, client_id: str, job: JobPosting, note: str | None) -> SavedJob:
        existing = await self.session.scalar(
            select(SavedJob).where(SavedJob.client_id == client_id, SavedJob.job_id == job.id)
        )
        if existing:
            existing.note = note
            await self.session.commit()
            return existing
        row = SavedJob(
            client_id=client_id,
            job_id=job.id,
            title=job.title,
            company=job.company,
            apply_url=str(job.apply_url),
            payload=job.model_dump_json(),
            note=note,
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def list(self, client_id: str) -> list[SavedJob]:
        result = await self.session.scalars(
            select(SavedJob).where(SavedJob.client_id == client_id).order_by(desc(SavedJob.saved_at))
        )
        return list(result)

    async def get_payload(self, client_id: str, job_id: str) -> JobPosting | None:
        row = await self.session.scalar(
            select(SavedJob).where(SavedJob.client_id == client_id, SavedJob.job_id == job_id)
        )
        return JobPosting(**json.loads(row.payload)) if row else None

    async def remove(self, client_id: str, job_id: str) -> bool:
        result = await self.session.execute(
            delete(SavedJob).where(SavedJob.client_id == client_id, SavedJob.job_id == job_id)
        )
        await self.session.commit()
        return result.rowcount > 0


class SearchHistoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(self, client_id: str, query: str, location: str | None, count: int) -> None:
        self.session.add(
            SearchHistory(client_id=client_id, query=query, location=location, result_count=count)
        )
        await self.session.commit()

    async def recent(self, client_id: str, limit: int = 10) -> list[SearchHistory]:
        result = await self.session.scalars(
            select(SearchHistory)
            .where(SearchHistory.client_id == client_id)
            .order_by(desc(SearchHistory.searched_at))
            .limit(limit)
        )
        return list(result)


class CrawlerLogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record_many(self, rows: list[dict]) -> None:
        self.session.add_all([CrawlerLog(**r) for r in rows])
        await self.session.commit()

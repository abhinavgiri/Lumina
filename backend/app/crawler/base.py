"""Base crawler adapter — the extension point of the whole system.

Add a source by subclassing SourceAdapter and registering it. The search
service, ranking, dedupe, caching, and API never change. (SOLID: open for
extension, closed for modification.)
"""
from __future__ import annotations

import abc

from app.crawler.circuit_breaker import breakers
from app.core.logging import get_logger
from app.schemas.job import JobPosting

log = get_logger("adapter")


class SourceAdapter(abc.ABC):
    #: Stable, human-readable source name shown in results and logs.
    name: str
    #: The ATS/platform family this adapter belongs to (for the job's ats_platform).
    ats_platform: str | None = None
    #: Aggregators run a REAL upstream search per query (rate-limited APIs);
    #: board adapters fetch a full company board and filter locally, so the
    #: search service fans multiple queries out to aggregators but fetches
    #: each board only once.
    aggregator: bool = False

    @abc.abstractmethod
    async def fetch(self, query: str, location: str | None) -> list[JobPosting]:
        """Return normalized postings for a query. Raise on hard failure."""

    def is_available(self) -> bool:
        """Override to gate on config (e.g. required API key). Default: always."""
        return True

    async def search(self, query: str, location: str | None) -> list[JobPosting]:
        """Circuit-breaker-wrapped fetch used by the search service."""
        if breakers.is_open(self.name):
            log.warning("source_circuit_open", source=self.name)
            raise RuntimeError(f"{self.name} circuit open")
        try:
            jobs = await self.fetch(query, location)
            breakers.record_success(self.name)
            return jobs
        except Exception:
            breakers.record_failure(self.name)
            raise

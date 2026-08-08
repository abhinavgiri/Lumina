"""Greenhouse public job-board API adapter.

Endpoint (public, no auth): boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
Returns the company's full board; we filter by query client-side.
"""
from __future__ import annotations

from datetime import datetime

from app.crawler.base import SourceAdapter
from app.crawler.http_client import get_json
from app.schemas.job import EmploymentType, JobPosting, RemoteStatus
from app.utils.location import location_matches
from app.utils.text import detect_employment_type, detect_remote, extract_skills, strip_html


#: Cap jobs normalized per board so a company with 400+ postings can't dominate
#: CPU/latency. Query-matched jobs are ranked later anyway.
_MAX_PER_BOARD = 75


def _query_hit(query: str, *fields: str) -> bool:
    terms = [t for t in query.lower().split() if len(t) > 1]
    if not terms:
        return True
    hay = " ".join(fields).lower()
    hits = sum(1 for t in terms if t in hay)
    return hits >= (len(terms) + 1) // 2


class GreenhouseAdapter(SourceAdapter):
    ats_platform = "Greenhouse"

    def __init__(self, company: str) -> None:
        self.company = company
        self.name = f"Greenhouse:{company}"

    async def fetch(self, query: str, location: str | None) -> list[JobPosting]:
        data = await get_json(
            f"https://boards-api.greenhouse.io/v1/boards/{self.company}/jobs",
            params={"content": "true"},
        )
        raw_jobs = data.get("jobs", []) if isinstance(data, dict) else []
        out: list[JobPosting] = []

        for j in raw_jobs:
            if len(out) >= _MAX_PER_BOARD:
                break
            title = j.get("title", "")
            loc = (j.get("location") or {}).get("name", "") or "Unspecified"
            raw_content = j.get("content", "")
            # Cheap match first (title + raw HTML substring); only strip HTML for keepers.
            if not _query_hit(query, title, raw_content):
                continue
            if not location_matches(location, loc):
                continue
            desc = strip_html(raw_content)

            posted = None
            if j.get("updated_at"):
                try:
                    posted = datetime.fromisoformat(j["updated_at"].replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    posted = None

            combined = f"{title} {loc} {desc}"
            out.append(
                JobPosting(
                    id=f"greenhouse-{self.company}-{j.get('id')}",
                    title=title,
                    company=j.get("company_name") or self.company.replace("-", " ").title(),
                    company_website=f"https://boards.greenhouse.io/{self.company}",
                    location=loc,
                    remote_status=RemoteStatus(detect_remote(combined)),
                    description=desc[:12000],
                    skills=extract_skills(desc)[:12],
                    employment_type=EmploymentType(detect_employment_type(combined)),
                    posted_at=posted,
                    apply_url=j.get("absolute_url"),
                    source=self.ats_platform,
                    ats_platform=self.ats_platform,
                )
            )
        return out

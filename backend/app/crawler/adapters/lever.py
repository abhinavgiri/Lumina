"""Lever public postings API adapter.

Endpoint (public, no auth): api.lever.co/v0/postings/{slug}?mode=json
Returns an array of the company's postings.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.crawler.base import SourceAdapter
from app.crawler.http_client import get_json
from app.schemas.job import EmploymentType, JobPosting, RemoteStatus
from app.utils.location import location_matches
from app.utils.text import detect_employment_type, detect_remote, extract_skills, strip_html

_COMMITMENT_MAP = {
    "full-time": EmploymentType.full_time,
    "full time": EmploymentType.full_time,
    "part-time": EmploymentType.part_time,
    "contract": EmploymentType.contract,
    "internship": EmploymentType.internship,
    "intern": EmploymentType.internship,
}


_MAX_PER_BOARD = 75


def _query_hit(query: str, *fields: str) -> bool:
    terms = [t for t in query.lower().split() if len(t) > 1]
    if not terms:
        return True
    hay = " ".join(fields).lower()
    return sum(1 for t in terms if t in hay) >= (len(terms) + 1) // 2


class LeverAdapter(SourceAdapter):
    ats_platform = "Lever"

    def __init__(self, company: str) -> None:
        self.company = company
        self.name = f"Lever:{company}"

    async def fetch(self, query: str, location: str | None) -> list[JobPosting]:
        data = await get_json(f"https://api.lever.co/v0/postings/{self.company}", params={"mode": "json"})
        raw = data if isinstance(data, list) else []
        out: list[JobPosting] = []

        for j in raw:
            if len(out) >= _MAX_PER_BOARD:
                break
            title = j.get("text", "")
            cats = j.get("categories") or {}
            loc = cats.get("location") or "Unspecified"
            raw_desc = j.get("descriptionPlain") or j.get("description", "")
            if not _query_hit(query, title, raw_desc):
                continue
            desc = j.get("descriptionPlain") or strip_html(j.get("description", ""))
            if not location_matches(location, loc):
                continue

            posted = None
            if j.get("createdAt"):
                try:
                    posted = datetime.fromtimestamp(j["createdAt"] / 1000, tz=timezone.utc)
                except (ValueError, TypeError, OSError):
                    posted = None

            commitment = (cats.get("commitment") or "").lower()
            emp = _COMMITMENT_MAP.get(commitment, EmploymentType(detect_employment_type(f"{title} {desc}")))
            workplace = (j.get("workplaceType") or "").lower()
            remote = (
                RemoteStatus.remote if workplace == "remote"
                else RemoteStatus.hybrid if workplace == "hybrid"
                else RemoteStatus.onsite if workplace in ("on-site", "onsite")
                else RemoteStatus(detect_remote(f"{loc} {desc}"))
            )

            out.append(
                JobPosting(
                    id=f"lever-{self.company}-{j.get('id')}",
                    title=title,
                    company=self.company.replace("-", " ").title(),
                    company_website=f"https://jobs.lever.co/{self.company}",
                    location=loc,
                    remote_status=remote,
                    description=desc[:12000],
                    skills=extract_skills(desc)[:12],
                    employment_type=emp,
                    posted_at=posted,
                    apply_url=j.get("hostedUrl") or j.get("applyUrl"),
                    source=self.ats_platform,
                    ats_platform=self.ats_platform,
                )
            )
        return out

"""Ashby public job-board API adapter.

Endpoint (public, no auth): api.ashbyhq.com/posting-api/job-board/{slug}
Returns {"jobs": [...]} for the company's board.
"""
from __future__ import annotations

from datetime import datetime

from app.crawler.base import SourceAdapter
from app.crawler.http_client import get_json
from app.schemas.job import EmploymentType, JobPosting, RemoteStatus
from app.utils.location import location_matches
from app.utils.text import detect_employment_type, extract_skills, strip_html

_EMP_MAP = {
    "fulltime": EmploymentType.full_time,
    "parttime": EmploymentType.part_time,
    "contract": EmploymentType.contract,
    "intern": EmploymentType.internship,
    "internship": EmploymentType.internship,
}


_MAX_PER_BOARD = 75


def _query_hit(query: str, *fields: str) -> bool:
    terms = [t for t in query.lower().split() if len(t) > 1]
    if not terms:
        return True
    hay = " ".join(fields).lower()
    return sum(1 for t in terms if t in hay) >= (len(terms) + 1) // 2


class AshbyAdapter(SourceAdapter):
    ats_platform = "Ashby"

    def __init__(self, company: str) -> None:
        self.company = company
        self.name = f"Ashby:{company}"

    async def fetch(self, query: str, location: str | None) -> list[JobPosting]:
        data = await get_json(f"https://api.ashbyhq.com/posting-api/job-board/{self.company}")
        raw = data.get("jobs", []) if isinstance(data, dict) else []
        out: list[JobPosting] = []

        for j in raw:
            if len(out) >= _MAX_PER_BOARD:
                break
            title = j.get("title", "")
            loc = j.get("location") or "Unspecified"
            raw_desc = j.get("descriptionPlain") or j.get("descriptionHtml", "")
            if not _query_hit(query, title, raw_desc):
                continue
            if not location_matches(location, loc, is_remote=bool(j.get("isRemote"))):
                continue
            desc = j.get("descriptionPlain") or strip_html(j.get("descriptionHtml", ""))

            posted = None
            if j.get("publishedAt"):
                try:
                    posted = datetime.fromisoformat(str(j["publishedAt"]).replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    posted = None

            emp_raw = (j.get("employmentType") or "").lower().replace(" ", "")
            emp = _EMP_MAP.get(emp_raw, EmploymentType(detect_employment_type(f"{title} {desc}")))
            remote = RemoteStatus.remote if j.get("isRemote") else RemoteStatus.onsite

            out.append(
                JobPosting(
                    id=f"ashby-{self.company}-{j.get('id')}",
                    title=title,
                    company=j.get("organizationName") or self.company.replace("-", " ").title(),
                    company_website=f"https://jobs.ashbyhq.com/{self.company}",
                    location=loc,
                    remote_status=remote,
                    description=desc[:12000],
                    skills=extract_skills(desc)[:12],
                    employment_type=emp,
                    posted_at=posted,
                    apply_url=j.get("applyUrl") or j.get("jobUrl"),
                    source=self.ats_platform,
                    ats_platform=self.ats_platform,
                )
            )
        return out

"""Jooble aggregator adapter — global coverage with strong India listings.

Public JSON API, free key at https://jooble.org/api/about. Set JOOBLE_API_KEY
to activate. The endpoint is POST https://jooble.org/api/{key} with a JSON body
of {keywords, location}. Aggregates across many boards, so like Adzuna it adds
India-wide breadth without scraping any site.
"""
from __future__ import annotations

from datetime import datetime

from app.core.config import settings
from app.crawler.base import SourceAdapter
from app.crawler.http_client import post_json
from app.schemas.job import EmploymentType, JobPosting, RemoteStatus
from app.utils.text import detect_employment_type, detect_remote, extract_skills, strip_html

_MAX_RESULTS = 50


class JoobleAdapter(SourceAdapter):
    ats_platform = None
    name = "Jooble"
    aggregator = True

    def is_available(self) -> bool:
        return bool(settings.jooble_api_key)

    async def fetch(self, query: str, location: str | None) -> list[JobPosting]:
        body: dict[str, str] = {"keywords": query}
        if location:
            body["location"] = location
        data = await post_json(f"https://jooble.org/api/{settings.jooble_api_key}", json=body)
        jobs = data.get("jobs", []) if isinstance(data, dict) else []
        out: list[JobPosting] = []

        for j in jobs[:_MAX_RESULTS]:
            apply_url = j.get("link")
            if not apply_url:
                continue
            title = str(j.get("title", "")).strip()
            loc = j.get("location") or "Unspecified"
            desc = strip_html(j.get("snippet", ""))
            combined = f"{title} {loc} {desc}"

            posted = None
            if j.get("updated"):
                try:
                    posted = datetime.fromisoformat(str(j["updated"]).replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    posted = None

            emp_raw = str(j.get("type", ""))
            emp = detect_employment_type(f"{emp_raw} {combined}")
            out.append(
                JobPosting(
                    id=f"jooble-{j.get('id') or abs(hash(apply_url))}",
                    title=title or "Untitled role",
                    company=j.get("company") or "Unknown",
                    location=loc,
                    remote_status=RemoteStatus(detect_remote(combined)),
                    salary=(j.get("salary") or None),
                    description=desc[:12000],
                    skills=extract_skills(desc)[:12],
                    employment_type=EmploymentType(emp),
                    posted_at=posted,
                    apply_url=apply_url,
                    source="Jooble",
                    ats_platform=None,
                )
            )
        return out

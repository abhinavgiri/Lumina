"""Adzuna aggregator adapter — broad coverage including India-wide listings.

Public JSON API, free key at https://developer.adzuna.com. Set ADZUNA_APP_ID
and ADZUNA_APP_KEY (and optionally ADZUNA_COUNTRY, default "in") to activate.

Unlike the ATS board adapters (one company each), Adzuna aggregates postings
across thousands of employers and job boards, which is the fastest way to get
India-wide breadth without scraping any site.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.core.config import settings
from app.crawler.base import SourceAdapter
from app.crawler.http_client import get_json
from app.schemas.job import EmploymentType, JobPosting, RemoteStatus
from app.utils.text import detect_employment_type, detect_remote, extract_skills, strip_html

_MAX_RESULTS = 50


class AdzunaAdapter(SourceAdapter):
    ats_platform = None
    name = "Adzuna"
    aggregator = True

    def is_available(self) -> bool:
        return bool(settings.adzuna_app_id and settings.adzuna_app_key)

    async def fetch(self, query: str, location: str | None) -> list[JobPosting]:
        country = (settings.adzuna_country or "in").lower()
        params = {
            "app_id": settings.adzuna_app_id,
            "app_key": settings.adzuna_app_key,
            "what": query,
            "results_per_page": str(_MAX_RESULTS),
            "content-type": "application/json",
        }
        if location:
            params["where"] = location
        data = await get_json(
            f"https://api.adzuna.com/v1/api/jobs/{country}/search/1", params=params
        )
        results = data.get("results", []) if isinstance(data, dict) else []
        out: list[JobPosting] = []

        for j in results:
            apply_url = j.get("redirect_url")
            if not apply_url:
                continue
            title = str(j.get("title", "")).replace("<", " ").replace(">", " ").strip()
            loc = (j.get("location") or {}).get("display_name") or "Unspecified"
            desc = strip_html(j.get("description", ""))
            combined = f"{title} {loc} {desc}"

            salary = None
            lo = j.get("salary_min")
            hi = j.get("salary_max")
            if lo and hi:
                salary = f"{int(lo):,} - {int(hi):,}"

            posted = None
            if j.get("created"):
                try:
                    posted = datetime.fromisoformat(str(j["created"]).replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    posted = None
            if posted and not posted.tzinfo:
                posted = posted.replace(tzinfo=timezone.utc)

            cat = (j.get("category") or {}).get("label")
            out.append(
                JobPosting(
                    id=f"adzuna-{j.get('id')}",
                    title=title or "Untitled role",
                    company=(j.get("company") or {}).get("display_name") or "Unknown",
                    location=loc,
                    remote_status=RemoteStatus(detect_remote(combined)),
                    salary=salary,
                    description=desc[:12000],
                    skills=(extract_skills(desc) or ([cat] if cat else []))[:12],
                    employment_type=EmploymentType(detect_employment_type(combined)),
                    posted_at=posted,
                    apply_url=apply_url,
                    source="Adzuna",
                    ats_platform=None,
                )
            )
        return out

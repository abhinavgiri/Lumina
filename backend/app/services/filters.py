"""Post-search filtering on the merged result set."""
from __future__ import annotations

import re
from datetime import datetime, timezone

from app.schemas.job import JobPosting, SearchFilters


def apply_filters(jobs: list[JobPosting], f: SearchFilters | None) -> list[JobPosting]:
    if not f:
        return jobs

    out = jobs
    if f.remote_status:
        allowed = set(f.remote_status)
        out = [j for j in out if j.remote_status in allowed]
    if f.employment_type:
        allowed_t = set(f.employment_type)
        out = [j for j in out if j.employment_type in allowed_t]
    if f.company:
        c = f.company.lower()
        out = [j for j in out if c in j.company.lower()]
    if f.posted_within_days is not None:
        cutoff = f.posted_within_days
        out = [j for j in out if _within_days(j, cutoff)]
    if f.max_experience_years is not None:
        out = [j for j in out if _experience_ok(j, f.max_experience_years)]
    if f.min_salary is not None:
        out = [j for j in out if _salary_ok(j, f.min_salary)]
    return out


def _within_days(job: JobPosting, days: int) -> bool:
    if not job.posted_at:
        return True
    posted = job.posted_at if job.posted_at.tzinfo else job.posted_at.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - posted).days <= days


def _experience_ok(job: JobPosting, max_years: int) -> bool:
    m = re.search(r"(\d+)\s*\+?\s*years", f"{job.title} {job.description}".lower())
    return True if not m else int(m.group(1)) <= max_years


def _salary_ok(job: JobPosting, min_salary: int) -> bool:
    if not job.salary:
        return True  # don't exclude jobs that simply omit salary
    nums = [int(n.replace(",", "")) for n in re.findall(r"[\d,]{4,}", job.salary)]
    return True if not nums else max(nums) >= min_salary

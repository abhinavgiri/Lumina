"""Pydantic schemas for the job domain — the API contract with the frontend."""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, HttpUrl


class RemoteStatus(str, Enum):
    remote = "remote"
    hybrid = "hybrid"
    onsite = "onsite"
    unknown = "unknown"


class EmploymentType(str, Enum):
    full_time = "full_time"
    part_time = "part_time"
    contract = "contract"
    internship = "internship"
    unknown = "unknown"


class JobPosting(BaseModel):
    """A normalized posting from any source adapter."""

    id: str
    title: str
    company: str
    company_logo: str | None = None
    company_website: str | None = None
    salary: str | None = None
    location: str
    remote_status: RemoteStatus = RemoteStatus.unknown
    experience: str | None = None
    skills: list[str] = Field(default_factory=list)
    description: str
    employment_type: EmploymentType = EmploymentType.unknown
    posted_at: datetime | None = None
    apply_url: HttpUrl
    source: str
    ats_platform: str | None = None
    #: Which planned role query this posting satisfied (multi-query search).
    matched_role: str | None = None


class ScoredJob(JobPosting):
    """A posting with a resume-aware ranking score and explanation."""

    score: float = 0.0
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    #: Short human-readable reasons this job ranked where it did.
    match_reasons: list[str] = Field(default_factory=list)


class SearchFilters(BaseModel):
    remote_status: list[RemoteStatus] | None = None
    employment_type: list[EmploymentType] | None = None
    min_salary: int | None = None
    max_experience_years: int | None = None
    company: str | None = None
    posted_within_days: int | None = None


class JobSearchRequest(BaseModel):
    title: str = Field("", description="Job title / role query")
    skills: list[str] = Field(default_factory=list)
    experience_years: int | None = None
    location: str | None = None
    remote_preference: RemoteStatus | None = None
    expected_salary: int | None = None
    company: str | None = None
    job_type: EmploymentType | None = None
    keywords: list[str] = Field(default_factory=list)
    filters: SearchFilters | None = None
    # Optional resume text for resume-aware ranking. Sent by the frontend from
    # locally-parsed resume text; never persisted with PII by default.
    resume_text: str | None = None
    limit: int = Field(30, ge=1, le=100)


class SourceStatus(BaseModel):
    name: str
    ok: bool
    count: int
    error: str | None = None
    from_cache: bool = False


class JobSearchResponse(BaseModel):
    query: str
    #: Every role query the search fanned out to (resume-derived), ranked.
    roles_searched: list[str] = Field(default_factory=list)
    total: int
    scored: bool
    jobs: list[ScoredJob]
    sources: list[SourceStatus]
    took_ms: int


class SavedJobIn(BaseModel):
    job: JobPosting
    note: str | None = None


class SavedJobOut(BaseModel):
    id: int
    job_id: str
    title: str
    company: str
    apply_url: str
    note: str | None = None
    saved_at: datetime


class RecentSearchOut(BaseModel):
    id: int
    query: str
    location: str | None
    result_count: int
    searched_at: datetime

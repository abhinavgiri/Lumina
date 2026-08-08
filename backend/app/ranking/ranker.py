"""Weighted, explainable job ranking.

Signals (each 0..1, then weighted): title/keyword match, resume skill match,
freshness, salary presence, experience fit, remote preference, company
preference, verified/ATS-sourced. Produces a 0..100 score plus matched/missing
skills for the UI.

This is intentionally a transparent scoring function rather than a black-box
ranker; it lives behind a single call so it can later be swapped for an
Elasticsearch/learned ranker without touching the search service.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.job import JobPosting, JobSearchRequest, RemoteStatus, ScoredJob
from app.utils.text import extract_skills

_WEIGHTS = {
    "title": 0.26,
    "skills": 0.24,
    "freshness": 0.12,
    "salary": 0.06,
    "experience": 0.10,
    "remote": 0.10,
    "company": 0.06,
    "verified": 0.06,
}


def _title_score(query: str, keywords: list[str], job: JobPosting) -> float:
    # Prefer the role this job actually matched during multi-query planning —
    # that's the resume-derived signal, not just whatever the user typed.
    effective = job.matched_role or query
    terms = [t for t in f"{effective} {' '.join(keywords)}".lower().split() if len(t) > 2]
    if not terms:
        return 0.5
    title = job.title.lower()
    in_title = sum(1 for t in set(terms) if t in title) / len(set(terms))
    if effective and effective.lower() in title:
        return min(1.0, 0.7 + in_title * 0.3)
    return in_title


def _freshness_score(job: JobPosting) -> float:
    if not job.posted_at:
        return 0.4
    posted = job.posted_at if job.posted_at.tzinfo else job.posted_at.replace(tzinfo=timezone.utc)
    days = (datetime.now(timezone.utc) - posted).days
    if days <= 3:
        return 1.0
    if days <= 7:
        return 0.85
    if days <= 30:
        return 0.6
    if days <= 90:
        return 0.3
    return 0.1


def _experience_score(req_years: int | None, job: JobPosting) -> float:
    if req_years is None:
        return 0.6
    text = f"{job.title} {job.description}".lower()
    import re

    m = re.search(r"(\d+)\s*\+?\s*years", text)
    if not m:
        return 0.6
    needed = int(m.group(1))
    if req_years >= needed:
        return 1.0
    gap = needed - req_years
    return max(0.1, 1.0 - gap * 0.15)


def _remote_score(pref: RemoteStatus | None, job: JobPosting) -> float:
    if pref is None:
        return 0.6
    if job.remote_status == RemoteStatus.unknown:
        return 0.5
    return 1.0 if job.remote_status == pref else 0.2


def rank_jobs(
    jobs: list[JobPosting],
    req: JobSearchRequest,
    role_order: list[str] | None = None,
) -> list[ScoredJob]:
    resume_skills = set(extract_skills(req.resume_text)) if req.resume_text else set()
    req_skills = {s.lower() for s in req.skills}
    company_pref = (req.company or "").lower().strip()

    # Jobs matching the resume's TOP-ranked roles should outrank jobs matching
    # a role that barely made the plan (a "Cloud Engineer" match on one skill
    # must not beat a "Data Engineer" match on six).
    role_rank: dict[str, int] = {r: i for i, r in enumerate(role_order)} if role_order else {}

    def role_factor(job: JobPosting) -> float:
        if not role_rank or not job.matched_role or job.matched_role not in role_rank:
            return 1.0
        idx = role_rank[job.matched_role]
        span = max(1, len(role_rank) - 1)
        return 1.0 - 0.30 * (idx / span)

    scored: list[ScoredJob] = []
    for job in jobs:
        job_skills = set(job.skills)

        # skills signal: resume-aware if a resume was supplied, else query-skill based
        if resume_skills:
            want = job_skills or set(extract_skills(job.description))
            matched = sorted(resume_skills & want)
            missing = sorted(want - resume_skills)[:6]
            skills_sig = (len(matched) / len(want)) if want else 0.5
        else:
            matched = sorted(s for s in job_skills if s.lower() in req_skills)
            missing = sorted(s for s in req_skills if s not in {k.lower() for k in job_skills})[:6]
            skills_sig = (len(matched) / len(req_skills)) if req_skills else 0.5

        signals = {
            "title": _title_score(req.title, req.keywords, job),
            "skills": skills_sig,
            "freshness": _freshness_score(job),
            "salary": 1.0 if job.salary else 0.4,
            "experience": _experience_score(req.experience_years, job),
            "remote": _remote_score(req.remote_preference, job),
            "company": 1.0 if company_pref and company_pref in job.company.lower() else 0.5,
            "verified": 0.9 if job.ats_platform else 0.5,  # ATS-sourced == verified employer
        }
        score = sum(signals[k] * w for k, w in _WEIGHTS.items()) * 100
        score *= role_factor(job)

        # Resume-aware guard: a job the resume shares NO skills with shouldn't ride
        # a title-keyword coincidence to the top (e.g. an electrical "Data Center
        # Engineer" outscoring a real data-engineering match). Penalize zero overlap.
        if resume_skills and not matched:
            score *= 0.65

        score = round(score, 1)

        # Explain the ranking in plain language (shown on the job card).
        reasons: list[str] = []
        if job.matched_role:
            reasons.append(f'Fits your "{job.matched_role}" profile')
        if matched:
            preview = ", ".join(matched[:3])
            reasons.append(f"You already have {len(matched)} required skill{'s' if len(matched) != 1 else ''} ({preview})")
        if job.posted_at:
            posted = job.posted_at if job.posted_at.tzinfo else job.posted_at.replace(tzinfo=timezone.utc)
            days = (datetime.now(timezone.utc) - posted).days
            if days <= 7:
                reasons.append("Posted this week")
        if job.remote_status == RemoteStatus.remote:
            reasons.append("Remote-friendly")
        if resume_skills and missing:
            reasons.append(f"Boost this match by adding: {', '.join(missing[:3])}")

        scored.append(
            ScoredJob(
                **job.model_dump(),
                score=score,
                matched_skills=matched[:8],
                missing_skills=missing,
                match_reasons=reasons[:4],
            )
        )

    scored.sort(key=lambda j: j.score, reverse=True)
    return scored

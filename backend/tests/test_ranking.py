"""Unit tests for dedupe + ranking (no network)."""
from __future__ import annotations

from app.ranking.dedupe import deduplicate
from app.ranking.ranker import rank_jobs
from app.schemas.job import JobPosting, JobSearchRequest, RemoteStatus


def _job(**kw) -> JobPosting:
    base = dict(
        id="x",
        title="Data Engineer",
        company="Acme",
        location="Remote",
        description="We use Python, SQL, Airflow and AWS to build data pipelines.",
        apply_url="https://example.com/job",
        source="Greenhouse",
        ats_platform="Greenhouse",
        remote_status=RemoteStatus.remote,
    )
    base.update(kw)
    return JobPosting(**base)


def test_dedupe_merges_same_title_company_across_sources():
    a = _job(id="1", source="Greenhouse")
    b = _job(id="2", source="Ashby", title="Data Engineer (Remote)")
    merged = deduplicate([a, b])
    assert len(merged) == 1
    assert "Greenhouse" in merged[0].source and "Ashby" in merged[0].source


def test_dedupe_keeps_distinct_jobs():
    a = _job(id="1", title="Data Engineer")
    b = _job(id="2", title="Frontend Engineer")
    assert len(deduplicate([a, b])) == 2


def test_ranking_prefers_title_match():
    de = _job(id="1", title="Senior Data Engineer")
    pm = _job(id="2", title="Product Manager")
    req = JobSearchRequest(title="data engineer", limit=10)
    ranked = rank_jobs([pm, de], req)
    assert ranked[0].id == "1"
    assert ranked[0].score >= ranked[1].score


def test_ranking_resume_aware_skills():
    job = _job(description="Requires Python, Airflow, AWS, Snowflake.")
    req = JobSearchRequest(title="data engineer", resume_text="Skilled in Python and AWS.", limit=10)
    ranked = rank_jobs([job], req)
    assert "Python" in ranked[0].matched_skills
    assert "Snowflake" in ranked[0].missing_skills

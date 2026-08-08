"""CHARACTERIZATION tests — the safety net for the V2 refactor.

These pin what the code ACTUALLY DOES TODAY, quirks included. They are not a
statement that current behavior is ideal. Their job is to make any behavior
change during refactoring fail loudly instead of silently.

If one of these fails after a refactor, ask: did I intend this change?
  - intended  -> update the expected value in the same commit, note why
  - unintended-> you just caught a regression

Every value here was captured by running the current code, not written by hand.
"""
from __future__ import annotations

import pytest

import app.services.query_planner as qp
from app.schemas.job import JobPosting, JobSearchRequest, RemoteStatus
from app.ranking.dedupe import deduplicate
from app.ranking.ranker import rank_jobs
from app.services.query_planner import best_query_match, plan_queries
from app.utils.location import location_matches
from app.utils.text import detect_employment_type, detect_remote, extract_skills, strip_html

# A realistic BI/data resume — the profile the app was built around.
RESUME = """Abhinav Giri Goswami
Data Engineer with 4 years of experience.
SKILLS: SQL, Power BI, DAX, Oracle ODI, ETL, Python, Azure Data Factory
EXPERIENCE: Built ETL load plans in Oracle ODI processing 500+ PVOs; developed
Power BI dashboards with DAX measures over 1M+ rows."""


@pytest.fixture
def no_ml(monkeypatch):
    """Neutralize the ML role classifier.

    plan_queries() optionally boosts roles using our trained model. These tests
    pin the DETERMINISTIC layer, which must stay correct on its own (and in CI /
    Docker, where the model artifact and ML deps aren't installed).
    """
    monkeypatch.setattr(qp, "_ml_role_topk", lambda text: [])


# ---------------------------------------------------------------------------
# Skill extraction — the vocabulary everything else keys off
# ---------------------------------------------------------------------------

def test_extract_skills_finds_aliases_and_canonicalizes():
    # UPDATED 2026-08-08 (intended): the skill dictionary is now generated from
    # shared/skills.json, shared with the frontend. This stack gained 28 skills
    # it was previously blind to, plus the "bi" alias -> "Business Intelligence"
    # is now detected here as it always was on the frontend. Order is the
    # canonical file's (alphabetical) rather than the old hand-authored grouping.
    assert extract_skills(RESUME) == [
        "Azure", "Azure Data Factory", "Business Intelligence", "DAX", "ETL",
        "KPI Reporting", "Oracle ODI", "Power BI", "Python", "SQL",
    ]


def test_extract_skills_matches_on_alias_not_just_name():
    # "adf" -> Azure Data Factory, "powerbi" -> Power BI, "k8s" -> Kubernetes
    assert "Azure Data Factory" in extract_skills("Experienced with ADF pipelines")
    assert "Power BI" in extract_skills("built powerbi reports")
    assert "Kubernetes" in extract_skills("deployed on k8s")


def test_extract_skills_respects_word_boundaries():
    # "R" must not match inside other words; "Go" must not match "Google".
    assert "R" not in extract_skills("Strong performer in Sales")
    assert "Go" not in extract_skills("Used Google Analytics")


def test_extract_skills_empty_text_returns_empty():
    assert extract_skills("") == []


# ---------------------------------------------------------------------------
# Query planning — resume -> ranked role queries
# ---------------------------------------------------------------------------

def test_plan_queries_ranks_roles_from_whole_resume(no_ml):
    plan = plan_queries(JobSearchRequest(resume_text=RESUME, limit=10))
    # A literal title mention ("Oracle ODI") outranks pure skill-cluster evidence.
    assert plan.queries[0] == "Oracle ODI Developer"
    # UPDATED 2026-08-08 (intended, and an improvement): with the shared
    # dictionary this stack now detects "Business Intelligence", a heavy trigger
    # for the BI roles — so a Power BI/DAX resume correctly surfaces
    # "Power BI Developer" and "BI Developer" above the generic "Data Engineer".
    assert plan.queries[:4] == [
        "Oracle ODI Developer", "Power BI Developer", "BI Developer", "Data Engineer",
    ]
    assert len(plan.queries) <= qp.MAX_QUERIES


def test_plan_queries_explicit_title_always_leads(no_ml):
    plan = plan_queries(JobSearchRequest(resume_text=RESUME, title="Data Engineer", limit=10))
    assert plan.queries[0] == "Data Engineer"
    assert plan.queries.count("Data Engineer") == 1  # not duplicated by the ranked list


def test_plan_queries_without_resume_falls_back_to_query(no_ml):
    plan = plan_queries(JobSearchRequest(title="Chef", limit=10))
    assert plan.queries == ["Chef"]


def test_plan_queries_with_nothing_uses_default(no_ml):
    plan = plan_queries(JobSearchRequest(limit=10))
    assert plan.queries == ["software engineer"]


def test_plan_queries_ml_is_optional_and_never_breaks_search(monkeypatch):
    """The ML boost must be strictly additive: if the model raises, the
    deterministic plan is returned unchanged."""
    def boom(text):
        raise RuntimeError("model missing")

    monkeypatch.setattr(qp, "_ml_role_topk", lambda t: [])
    baseline = plan_queries(JobSearchRequest(resume_text=RESUME, limit=10)).queries

    monkeypatch.setattr(qp, "predict_role", boom, raising=False)
    monkeypatch.setattr("ml.infer.predict_role", boom, raising=False)
    plan = plan_queries(JobSearchRequest(resume_text=RESUME, limit=10))

    assert plan.queries == baseline
    assert plan.predicted_role is None


def test_seniority_detection_current_quirk(no_ml):
    """QUIRK PINNED: "4 years" yields no seniority — only >=8 (senior), <=1
    (junior), or an explicit seniority word are detected. Mid-level is None."""
    plan = plan_queries(JobSearchRequest(resume_text=RESUME, limit=10))
    assert plan.seniority is None

    senior = plan_queries(JobSearchRequest(resume_text="10 years of experience", limit=10))
    assert senior.seniority == "senior"


# ---------------------------------------------------------------------------
# Title matching — keeps unrelated jobs out of results
# ---------------------------------------------------------------------------

def test_best_query_match_exact_title_scores_full():
    assert best_query_match("Senior Data Engineer", ["Data Engineer"]) == ("Data Engineer", 1.0)


def test_best_query_match_penalizes_generic_noun_only_matches():
    """"Sales Engineer" shares only the generic noun "engineer" with "Data
    Engineer", so it scores 0.125 — far below the 0.45 threshold the search
    service uses to accept a match."""
    role, score = best_query_match("Sales Engineer", ["Data Engineer"])
    assert (role, score) == ("Data Engineer", 0.125)
    assert score < 0.45


def test_best_query_match_unrelated_title_matches_nothing():
    assert best_query_match("Chef", ["Data Engineer", "Power BI Developer"]) == (None, 0.0)


# ---------------------------------------------------------------------------
# Location — the India-relevance fix (a real bug that was fixed; keep it fixed)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "query,job_location,expected",
    [
        ("india", "Bengaluru, India", True),
        ("india", "Bangalore", True),      # city -> country
        ("india", "Gurgaon", True),        # spelling variant of Gurugram
        ("india", "Hyderabad", True),
        ("india", "Remote - India", True),
        ("india", "Remote", False),        # worldwide-remote is NOT an India match
        ("india", "London, UK", False),
        ("bengaluru", "Bangalore", True),  # variant <-> variant
        ("", "", True),                    # no filter = match everything
    ],
)
def test_location_matches(query, job_location, expected):
    assert location_matches(query, job_location) is expected


def test_location_us_cities_not_mapped_current_limitation():
    """QUIRK PINNED: only India has a city->country map. A US city does not
    resolve to "united states". Changing this should be a deliberate decision."""
    assert location_matches("united states", "New York, NY") is False


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "text,expected",
    [
        ("Fully remote role", "remote"),
        ("Hybrid 3 days", "hybrid"),
        ("On-site in Pune", "onsite"),
        ("unspecified", "unknown"),
    ],
)
def test_detect_remote(text, expected):
    assert detect_remote(text) == expected


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Summer internship", "internship"),
        ("Part-time position", "part_time"),
        ("6-month contract", "contract"),
        ("Full-time role", "full_time"),
        ("nothing stated", "unknown"),
    ],
)
def test_detect_employment_type(text, expected):
    assert detect_employment_type(text) == expected


def test_strip_html_preserves_structure_as_newlines():
    out = strip_html("<p>Build pipelines</p><ul><li>Spark</li><li>Airflow</li></ul>")
    assert "Build pipelines" in out
    assert "- Spark" in out and "- Airflow" in out
    assert "<" not in out


def test_strip_html_drops_script_and_style_content():
    out = strip_html("<style>.a{color:red}</style><script>alert(1)</script><p>Real</p>")
    assert "Real" in out
    assert "alert" not in out and "color:red" not in out


# ---------------------------------------------------------------------------
# Ranking — scores must stay explainable and resume-aware
# ---------------------------------------------------------------------------

def _job(**kw) -> JobPosting:
    base = dict(
        id="x", title="Data Engineer", company="Acme", location="Bengaluru, India",
        description="We use Python, SQL, Airflow and AWS to build data pipelines.",
        apply_url="https://example.com/job", source="Greenhouse",
        ats_platform="Greenhouse", remote_status=RemoteStatus.remote,
    )
    base.update(kw)
    return JobPosting(**base)


def test_rank_jobs_penalizes_zero_resume_skill_overlap():
    """A title coincidence must not carry a job with no shared skills to the top.

    Scores are pinned NUMERICALLY on purpose. An earlier version of this test
    only asserted the ordering — and a mutation that deleted the zero-overlap
    penalty entirely still passed, because the good job won on other signals.
    Pinning the numbers is what actually holds the weights and the guard.
    """
    req = JobSearchRequest(title="data engineer", resume_text="Python, SQL, Airflow.", limit=10)

    overlap = rank_jobs([_job(id="1", description="Python, SQL, Airflow pipelines.")], req)[0]
    assert overlap.matched_skills == ["Apache Airflow", "Python", "SQL"]
    assert overlap.score == 77.6

    # No shared skills -> score is multiplied by the 0.65 guard (65.5 -> 42.6).
    zero = rank_jobs([_job(id="2", description="HVAC and electrical systems only.")], req)[0]
    assert zero.matched_skills == []
    assert zero.score == 42.6

    # And the guard is what decides the ordering when titles are equally strong.
    ranked = rank_jobs(
        [_job(id="2", description="HVAC and electrical systems only."),
         _job(id="1", description="Python, SQL, Airflow pipelines.")],
        req,
    )
    assert [j.id for j in ranked] == ["1", "2"]


def test_rank_jobs_score_without_resume_is_pinned():
    """Baseline weighting with no resume supplied. Pinned so any change to
    _WEIGHTS is a deliberate, visible decision."""
    req = JobSearchRequest(title="data engineer", limit=10)
    assert rank_jobs([_job(id="3")], req)[0].score == 65.6


def test_rank_jobs_role_factor_prefers_top_planned_role():
    """A job matching the #1 planned role outranks an equivalent job matching
    the last planned role."""
    top = _job(id="1", matched_role="Data Engineer")
    low = _job(id="2", matched_role="Cloud Engineer")
    req = JobSearchRequest(title="data engineer", limit=10)
    ranked = rank_jobs([low, top], req, role_order=["Data Engineer", "Cloud Engineer"])
    assert ranked[0].id == "1"


def test_rank_jobs_emits_plain_language_reasons():
    job = _job(matched_role="Data Engineer", description="Requires Python, Airflow, Snowflake.")
    req = JobSearchRequest(title="data engineer", resume_text="Python and Airflow.", limit=10)
    reasons = rank_jobs([job], req)[0].match_reasons
    assert any("Data Engineer" in r for r in reasons)
    assert len(reasons) <= 4


def test_rank_jobs_scores_bounded_and_sorted():
    jobs = [_job(id=str(i), title=t) for i, t in enumerate(["Data Engineer", "Product Manager", "Chef"])]
    ranked = rank_jobs(jobs, JobSearchRequest(title="data engineer", limit=10))
    scores = [j.score for j in ranked]
    assert scores == sorted(scores, reverse=True)
    assert all(0 <= s <= 100 for s in scores)


def test_dedupe_merges_across_sources_keeping_both_names():
    merged = deduplicate([
        _job(id="1", source="Greenhouse"),
        _job(id="2", source="Ashby", title="Data Engineer (Remote)"),
    ])
    assert len(merged) == 1
    assert "Greenhouse" in merged[0].source and "Ashby" in merged[0].source

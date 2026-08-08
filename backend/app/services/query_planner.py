"""Resume-aware search-query planning.

Instead of searching one keyword, this module reads the WHOLE resume signal —
skills, technologies, stated job titles, seniority — and produces a ranked
list of 10-20 role queries to fan out across every job source. A Power BI +
SQL + Databricks resume should search "Power BI Developer", "BI Developer",
"Analytics Engineer", "Data Analyst", "ETL Developer"… not just one title.

Deterministic and local (no LLM): a weighted skills→roles map, plus boosts for
titles that literally appear in the resume and for the user's explicit query.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.logging import get_logger
from app.schemas.job import JobSearchRequest
from app.utils.text import extract_skills
# Role taxonomy is GENERATED from shared/roles.json (single source of truth with
# the frontend). Edit that file, then run `npm run gen:shared`.
from app.utils.skills_data import ROLE_TRIGGERS, TITLE_ALIASES

log = get_logger("planner")

#: How many role queries a search fans out to.
MAX_QUERIES = 16

#: Weight of our own role classifier's boost, scaled by its confidence (0..1).
#: Sits ALONGSIDE the deterministic signals (skill clusters, literal titles,
#: explicit query) — it nudges the ranking, it doesn't override them.
ML_ROLE_BOOST = 10.0

#: Titles searched for verbatim in the resume text — a literal mention is the
#: strongest signal that the person actually held / wants that role.
_TITLE_PATTERNS: list[tuple[str, str]] = [
    (role, role.lower()) for role in ROLE_TRIGGERS
] + TITLE_ALIASES

_SENIORITY_RE = re.compile(r"\b(intern|junior|senior|staff|principal|lead|manager|head)\b", re.I)
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*years?", re.I)


@dataclass
class QueryPlan:
    """The set of role queries a search fans out to, most-relevant first."""

    queries: list[str]
    skills: list[str]
    seniority: str | None = None
    predicted_role: str | None = None
    predicted_confidence: float = 0.0


def _ml_role_topk(resume: str) -> list[tuple[str, float]]:
    """Our own role classifier's top (role, prob) list for this resume, or [] if
    the trained model / ML deps aren't present. Fully optional: ANY failure
    (missing joblib, missing artifact, bad input) returns [] and leaves the
    deterministic plan untouched — see ml/infer.py."""
    if not resume.strip():
        return []
    try:
        from ml.infer import predict_role
        _, _, topk = predict_role(resume)
        return topk
    except Exception:  # noqa: BLE001 — ML is best-effort; never break search
        return []


def _detect_seniority(text: str) -> str | None:
    m = _YEARS_RE.search(text)
    if m:
        years = int(m.group(1))
        if years >= 8:
            return "senior"
        if years <= 1:
            return "junior"
    m2 = _SENIORITY_RE.search(text)
    return m2.group(1).lower() if m2 else None


def plan_queries(req: JobSearchRequest) -> QueryPlan:
    """Rank candidate roles for this resume/query and return the top queries."""
    resume = req.resume_text or ""
    resume_lower = resume.lower()
    skills = extract_skills(resume) if resume else []
    skill_set = set(skills)
    explicit = (req.title or "").strip()

    scores: dict[str, float] = {}

    # 1) Skill-cluster evidence
    for role, triggers in ROLE_TRIGGERS.items():
        s = sum(w for skill, w in triggers.items() if skill in skill_set)
        # Require at least a bit of real evidence before a role is a candidate.
        if s >= 3:
            scores[role] = s

    # 2) Titles literally present in the resume get a strong boost
    for role, needle in _TITLE_PATTERNS:
        if needle in resume_lower:
            scores[role] = scores.get(role, 0) + 6

    # 3) The user's explicit query always leads, and boosts overlapping roles
    if explicit:
        el = explicit.lower()
        for role in ROLE_TRIGGERS:
            rl = role.lower()
            if rl in el or el in rl:
                scores[role] = scores.get(role, 0) + 8

    # 4) Our own trained role classifier boosts the roles it infers from the
    #    WHOLE resume, scaled by confidence. Optional — no model/deps => no change.
    predicted_role: str | None = None
    predicted_conf = 0.0
    for i, (role, prob) in enumerate(_ml_role_topk(resume)):
        if i == 0:
            predicted_role, predicted_conf = role, prob
        if prob >= 0.15 and role in ROLE_TRIGGERS:
            scores[role] = scores.get(role, 0.0) + ML_ROLE_BOOST * prob
    if predicted_role:
        log.info("role_prediction", predicted=predicted_role, confidence=round(predicted_conf, 3))

    ranked = [r for r, _ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)]

    queries: list[str] = []
    if explicit:
        queries.append(explicit)
    for r in ranked:
        if r.lower() != explicit.lower():
            queries.append(r)
        if len(queries) >= MAX_QUERIES:
            break

    if not queries:
        queries = [explicit or "software engineer"]

    return QueryPlan(
        queries=queries,
        skills=skills,
        seniority=_detect_seniority(resume),
        predicted_role=predicted_role,
        predicted_confidence=round(predicted_conf, 3),
    )


# ---------------------------------------------------------------------------
# Multi-query matching: which planned role does a job satisfy, and how well?
# ---------------------------------------------------------------------------

_STOP = {"developer", "engineer", "analyst", "specialist", "consultant"}


def best_query_match(title: str, queries: list[str]) -> tuple[str | None, float]:
    """Return (best matching query, 0..1 score) for a job title.

    Scoring favors distinctive terms ("power bi", "etl") over generic role
    nouns ("engineer"), so "Sales Engineer" doesn't match "Data Engineer".
    """
    tl = f" {title.lower()} "
    best: tuple[str | None, float] = (None, 0.0)
    for q in queries:
        terms = [t for t in q.lower().split() if len(t) > 1]
        if not terms:
            continue
        hits = sum(1 for t in terms if t in tl)
        if hits == 0:
            continue
        distinctive = [t for t in terms if t not in _STOP]
        d_hits = sum(1 for t in distinctive if t in tl)
        score = hits / len(terms)
        # A match on ONLY generic nouns isn't a real match.
        if distinctive and d_hits == 0:
            score *= 0.25
        if q.lower() in tl:
            score = 1.0
        if score > best[1]:
            best = (q, score)
    return best

"""Guards the single source of truth for skills/roles — Python side.

The skills dictionary was once maintained BY HAND in both stacks and drifted to
77 entries here against the frontend's 104, so job matching was blind to skills
the resume scorer credited (Informatica, SSIS, Azure Synapse, JIRA…).

shared/skills.json + shared/roles.json are now canonical and both stacks are
generated from them. These tests fail if app/utils/skills_data.py drifts —
i.e. if someone edits the generated file instead of the source.

Fix a failure with: npm run gen:shared
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.query_planner import ROLE_TRIGGERS, _TITLE_PATTERNS
from app.utils.skills_data import SKILL_META
from app.utils.text import SKILLS, extract_skills

SHARED = Path(__file__).resolve().parents[2] / "shared"


@pytest.fixture(scope="module")
def canonical_skills() -> list[dict]:
    return json.loads((SHARED / "skills.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def canonical_roles() -> dict:
    return json.loads((SHARED / "roles.json").read_text(encoding="utf-8"))


def test_skill_names_match_canonical(canonical_skills):
    assert list(SKILLS.keys()) == [s["name"] for s in canonical_skills]


def test_skill_aliases_match_canonical(canonical_skills):
    expected = {s["name"]: s["aliases"] for s in canonical_skills}
    assert SKILLS == expected


def test_skill_meta_matches_canonical(canonical_skills):
    expected = {s["name"]: (s["category"], s["difficulty"]) for s in canonical_skills}
    assert SKILL_META == expected


def test_roles_match_canonical(canonical_roles):
    assert ROLE_TRIGGERS == canonical_roles["roles"]


def test_every_role_trigger_skill_exists():
    """A trigger naming a skill the dictionary doesn't have would silently never
    fire — the role could then never be planned from skill evidence."""
    unknown = sorted(
        {skill for triggers in ROLE_TRIGGERS.values() for skill in triggers} - set(SKILLS)
    )
    assert unknown == [], f"role triggers reference unknown skills: {unknown}"


def test_title_patterns_cover_every_role():
    assert {role for role, _ in _TITLE_PATTERNS} >= set(ROLE_TRIGGERS)


@pytest.mark.parametrize("skill", ["Informatica", "SSIS", "Azure Synapse", "JIRA", "PL/SQL"])
def test_previously_missing_skills_are_now_extractable(skill):
    """Regression guard for the exact drift that was found: these existed only in
    the TypeScript dictionary, so the job matcher never saw them."""
    assert skill in SKILLS


def test_extract_skills_finds_the_previously_invisible_ones():
    text = "Built ETL with Informatica and SSIS on Azure Synapse, tracked in JIRA."
    found = extract_skills(text)
    for skill in ["Informatica", "SSIS", "Azure Synapse", "JIRA", "ETL"]:
        assert skill in found

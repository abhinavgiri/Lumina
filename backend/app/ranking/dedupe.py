"""Cross-source duplicate detection.

Jobs from different boards that are the same role are merged. Strategy:
  1. cheap exact key: normalized (title, company)
  2. fuzzy pass: same company + high token-sort title similarity
The surviving record keeps the richest description and records extra sources.
"""
from __future__ import annotations

import re

from rapidfuzz import fuzz

from app.schemas.job import JobPosting

_PAREN = re.compile(r"\s*\([^)]*\)")
_NONWORD = re.compile(r"[^a-z0-9 ]")


def _norm_title(title: str) -> str:
    t = _PAREN.sub(" ", title.lower())
    t = _NONWORD.sub(" ", t)
    return " ".join(t.split())


def _norm_company(company: str) -> str:
    c = _NONWORD.sub(" ", company.lower())
    c = re.sub(r"\b(inc|llc|ltd|gmbh|corp|co)\b", "", c)
    return " ".join(c.split())


def deduplicate(jobs: list[JobPosting]) -> list[JobPosting]:
    kept: list[JobPosting] = []
    seen_exact: dict[str, int] = {}

    for job in jobs:
        nt, nc = _norm_title(job.title), _norm_company(job.company)
        exact_key = f"{nt}|{nc}"

        if exact_key in seen_exact:
            _merge_into(kept[seen_exact[exact_key]], job)
            continue

        # Fuzzy: same company, ~similar title
        dup_idx = None
        for idx, existing in enumerate(kept):
            if _norm_company(existing.company) != nc:
                continue
            if fuzz.token_sort_ratio(_norm_title(existing.title), nt) >= 90:
                dup_idx = idx
                break

        if dup_idx is not None:
            _merge_into(kept[dup_idx], job)
        else:
            seen_exact[exact_key] = len(kept)
            kept.append(job)

    return kept


def _merge_into(winner: JobPosting, other: JobPosting) -> None:
    if len(other.description) > len(winner.description):
        winner.description = other.description
    if not winner.salary and other.salary:
        winner.salary = other.salary
    if not winner.company_logo and other.company_logo:
        winner.company_logo = other.company_logo
    if other.source not in winner.source:
        winner.source = f"{winner.source}, {other.source}"
    winner.skills = sorted(set(winner.skills) | set(other.skills))

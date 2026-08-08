"""Builds the active set of source adapters from configuration.

`ats_boards` in settings is a comma-separated list of "provider:company"
entries. Add companies there (or new provider modules) — nothing else changes.
"""
from __future__ import annotations

from app.core.config import settings
from app.core.logging import get_logger
from app.crawler.adapters.adzuna import AdzunaAdapter
from app.crawler.adapters.ashby import AshbyAdapter
from app.crawler.adapters.greenhouse import GreenhouseAdapter
from app.crawler.adapters.jooble import JoobleAdapter
from app.crawler.adapters.lever import LeverAdapter
from app.crawler.base import SourceAdapter

log = get_logger("registry")

_BUILDERS = {
    "greenhouse": GreenhouseAdapter,
    "lever": LeverAdapter,
    "ashby": AshbyAdapter,
}

#: Aggregator adapters that cover many employers at once. They self-gate on
#: their API key via is_available(), so they stay inert until keys are set.
_AGGREGATORS: list[type[SourceAdapter]] = [AdzunaAdapter, JoobleAdapter]


def build_adapters() -> list[SourceAdapter]:
    adapters: list[SourceAdapter] = []
    for entry in settings.ats_boards.split(","):
        entry = entry.strip()
        if not entry or ":" not in entry:
            continue
        provider, company = entry.split(":", 1)
        builder = _BUILDERS.get(provider.strip().lower())
        if not builder:
            log.warning("unknown_provider", entry=entry)
            continue
        adapters.append(builder(company.strip()))

    adapters.extend(agg() for agg in _AGGREGATORS)

    return [a for a in adapters if a.is_available()]

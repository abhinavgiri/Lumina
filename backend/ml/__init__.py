"""Lumina's own ML engine (role classifier, semantic index). Optional at runtime:
the app imports lazily and falls back to deterministic logic if models/deps are
absent — see app/services/query_planner.py and ml/infer.py."""

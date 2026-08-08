"""Inference API for Lumina's own models — the single entry point the app calls.

Lazily loads the trained role classifier and (on demand) the semantic index, so
importing this is cheap and the FastAPI app only pays for what it uses. Both are
optional: if the artifacts/deps are missing, callers should fall back to the
existing deterministic logic (query_planner regex, keyword ranking).

    from ml.infer import predict_role
    role, conf, topk = predict_role(resume_text)
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.pii import strip_pii  # noqa: E402

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "role_clf.joblib")
_clf = None
_clf_loaded = False


def _classifier():
    global _clf, _clf_loaded
    if not _clf_loaded:
        _clf_loaded = True
        try:
            import joblib
            _clf = joblib.load(_MODEL_PATH) if os.path.exists(_MODEL_PATH) else None
        except Exception:
            _clf = None
    return _clf


def predict_role(text: str, top_k: int = 3) -> tuple[str | None, float, list[tuple[str, float]]]:
    """Return (best_role, confidence, [(role, prob), ...]) or (None, 0, []) if the
    model isn't available — caller falls back to the deterministic planner."""
    clf = _classifier()
    if clf is None:
        return None, 0.0, []
    doc = strip_pii(text)
    probs = clf.predict_proba([doc])[0]
    classes = clf.classes_
    ranked = sorted(zip(classes, probs), key=lambda kv: kv[1], reverse=True)
    best_role, best_p = ranked[0]
    return str(best_role), float(best_p), [(str(c), float(p)) for c, p in ranked[:top_k]]


def is_available() -> bool:
    return _classifier() is not None

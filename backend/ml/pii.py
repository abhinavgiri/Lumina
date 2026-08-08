"""PII stripping for resume text before training or indexing.

Two reasons this is non-negotiable:
  1. Legal/ethical — a model (and its embeddings) must never memorize a real
     person's name, email, or phone number. Consent to help with a resume is
     NOT consent to bake identity into a shared model.
  2. Technical — names/emails/phones are noise for a role classifier. Removing
     them makes the signal (skills, verbs, domain terms) cleaner.

Applied to every resume on the way into training/indexing, synthetic or real.
"""
from __future__ import annotations

import re

_EMAIL = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE = re.compile(r"(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}")
_URL = re.compile(r"\b(?:https?://|www\.)\S+|(?:linkedin\.com|github\.com)/\S+", re.I)
# Long digit runs (ids, aadhaar-like) that aren't years.
_LONGNUM = re.compile(r"\b\d{6,}\b")


def strip_pii(text: str) -> str:
    """Replace direct identifiers with typed placeholders (kept as tokens so the
    document shape survives — a resume still 'looks like' a resume)."""
    text = _EMAIL.sub(" <EMAIL> ", text)
    text = _URL.sub(" <URL> ", text)
    text = _PHONE.sub(" <PHONE> ", text)
    text = _LONGNUM.sub(" <NUM> ", text)
    # Collapse whitespace introduced by substitutions.
    return re.sub(r"[ \t]{2,}", " ", text).strip()

"""HTML/text normalization + skill extraction shared across adapters and ranking."""
from __future__ import annotations

import re

# The skill vocabulary is GENERATED from shared/skills.json so this stack and the
# frontend ATS scorer recognize exactly the same skills. It used to be a hand-
# maintained copy here and drifted to 77 skills against the frontend's 104 —
# meaning job matching was blind to skills the resume scorer credited.
# Edit shared/skills.json, then run `npm run gen:shared`.
from app.utils.skills_data import SKILLS, SKILL_META  # noqa: F401  (re-exported)


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t]+")
_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&#39;": "'", "&apos;": "'", "&quot;": '"',
}


def strip_html(html: str | None) -> str:
    if not html:
        return ""
    text = re.sub(r"<(style|script)[\s\S]*?</\1>", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(p|li|div|h[1-6])>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "- ", text, flags=re.IGNORECASE)
    text = _TAG_RE.sub(" ", text)
    for ent, rep in _ENTITIES.items():
        text = text.replace(ent, rep)
    text = _WS_RE.sub(" ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return text.strip()


def _contains_term(haystack_lower: str, term: str) -> bool:
    t = term.lower()
    if re.fullmatch(r"[a-z0-9 ./+#-]+", t):
        return re.search(rf"(^|[^a-z0-9]){re.escape(t)}([^a-z0-9]|$)", haystack_lower) is not None
    return t in haystack_lower


def extract_skills(text: str) -> list[str]:
    lower = f" {text.lower()} "
    found: list[str] = []
    for name, aliases in SKILLS.items():
        if _contains_term(lower, name) or any(_contains_term(lower, a) for a in aliases):
            found.append(name)
    return found


def detect_remote(text: str) -> str:
    low = text.lower()
    if "hybrid" in low:
        return "hybrid"
    if re.search(r"\b(remote|work from home|wfh|distributed team)\b", low):
        return "remote"
    if re.search(r"\b(on-?site|in office|in-person)\b", low):
        return "onsite"
    return "unknown"


def detect_employment_type(text: str) -> str:
    low = text.lower()
    if re.search(r"\bintern(ship)?\b", low):
        return "internship"
    if re.search(r"\b(part[- ]time)\b", low):
        return "part_time"
    if re.search(r"\b(contract|contractor|freelance)\b", low):
        return "contract"
    if re.search(r"\b(full[- ]time)\b", low):
        return "full_time"
    return "unknown"

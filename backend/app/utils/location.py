"""Location matching for job search.

Turns a user's free-text location ("india", "bangalore", "remote") into a
matcher against a job's location string.

Two problems this solves:
  1. India roles are usually listed by CITY ("Bengaluru", "Gurgaon") with no
     country, so a country-level search ("India") used to miss them.
  2. City spellings vary ("Bangalore" vs "Bengaluru", "Gurgaon" vs "Gurugram"),
     so a plain substring match dropped valid results.

Deliberately, a worldwide-"Remote" role is NOT treated as matching a country
query — that was the old bug that flooded an India search with US jobs. Use the
remote_status filter if the user actually wants remote-anywhere roles.
"""
from __future__ import annotations

# India cities / states / regions → so a country search matches city-only listings.
_INDIA_TOKENS = {
    "india", "bharat",
    "bangalore", "bengaluru", "mumbai", "bombay", "delhi", "new delhi",
    "gurgaon", "gurugram", "noida", "hyderabad", "pune", "chennai", "madras",
    "kolkata", "calcutta", "ahmedabad", "jaipur", "kochi", "cochin",
    "thiruvananthapuram", "trivandrum", "chandigarh", "indore", "coimbatore",
    "nagpur", "vadodara", "surat", "visakhapatnam", "vizag", "bhubaneswar",
    "mysore", "mysuru", "mohali", "gandhinagar", "lucknow",
    "karnataka", "maharashtra", "telangana", "tamil nadu", "kerala",
    "gujarat", "haryana", "uttar pradesh", "west bengal", "andhra pradesh",
}

# Country queries → their token set. Extend here for more countries later.
_COUNTRY_ALIASES: dict[str, set[str]] = {
    "india": _INDIA_TOKENS,
    "in": _INDIA_TOKENS,
    "bharat": _INDIA_TOKENS,
}

# City spelling variants — a query for any member matches a job listing any other.
_CITY_SYNONYMS: list[set[str]] = [
    {"bangalore", "bengaluru"},
    {"mumbai", "bombay"},
    {"delhi", "new delhi"},
    {"gurgaon", "gurugram"},
    {"chennai", "madras"},
    {"kolkata", "calcutta"},
    {"kochi", "cochin"},
    {"mysore", "mysuru"},
    {"thiruvananthapuram", "trivandrum"},
    {"visakhapatnam", "vizag"},
]


def _expand(term: str) -> set[str]:
    """Return the term plus any known spelling variants."""
    t = term.lower().strip()
    for group in _CITY_SYNONYMS:
        if t in group:
            return set(group)
    return {t}


def location_matches(query_loc: str | None, job_loc: str, *, is_remote: bool = False) -> bool:
    """True if a job's location satisfies the user's location query.

    - No query -> everything matches.
    - Country query ("india") -> matches the country name OR any known city/state.
    - City/other query -> substring match, tolerant of spelling variants.
    - A bare "Remote" listing does NOT satisfy a country/city query on its own.
    """
    if not query_loc or not query_loc.strip():
        return True

    jl = (job_loc or "").lower()
    q = query_loc.lower().strip()

    tokens = _COUNTRY_ALIASES.get(q)
    if tokens:
        return any(t in jl for t in tokens)

    # Generic: match the query (and its spelling variants) as a substring.
    return any(variant in jl for variant in _expand(q))

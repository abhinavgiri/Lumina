"""Synthetic labeled-resume generator — the bootstrap corpus for Lumina's own
role classifier / skill extractor / embedding index.

WHY synthetic: to train a model you need labels. A generated resume is labeled
*by construction* (we know the role because we built it), carries no real
person's PII, and is fully legal to train on. As real, consented resumes flow
in later (PII-stripped, ideally tagged with hiring OUTCOMES), they augment this
seed set — that's the actual "gets smarter with more data" flywheel.

Vocabulary + role signals are imported from the running app so there is ONE
source of truth (see REFACTORING_REPORT.md B4 — do not fork the skills map).

Run:  python ml/synth_resumes.py --n 600 --out ml/data/resumes.jsonl
Output: JSONL, one {text, role, skills[]} per line.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys

# Make the app package importable no matter where this is run from.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.query_planner import ROLE_TRIGGERS  # noqa: E402
from app.utils.text import SKILLS  # noqa: E402

ALL_SKILLS = list(SKILLS.keys())

# Roles distinct enough to be worth classifying (a subset of ROLE_TRIGGERS —
# some triggers like "BI Developer" vs "Reporting Analyst" overlap too much to
# separate cleanly at bootstrap; start with the clearly-separable ones).
TARGET_ROLES = [
    "Data Engineer", "Data Analyst", "Analytics Engineer", "Power BI Developer",
    "Data Scientist", "Machine Learning Engineer", "AI Engineer",
    "Backend Developer", "Frontend Developer", "Full Stack Developer",
    "DevOps Engineer", "Cloud Engineer", "Business Analyst",
]

# --- surface vocabulary (kept small; the point is signal, not literary quality) ---
FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Sara", "Vivaan", "Anaya",
         "Ishaan", "Priya", "Arjun", "Nisha", "Dev", "Tara", "Kunal", "Zoya"]
LAST = ["Sharma", "Reddy", "Iyer", "Nair", "Gupta", "Khan", "Bose", "Menon",
        "Rao", "Joshi", "Verma", "Das", "Pillai", "Shah"]
CITIES = ["Hyderabad", "Bengaluru", "Pune", "Gurugram", "Chennai", "Mumbai", "Remote"]
COMPANIES = ["Northwind", "Acme Data", "BlueOrbit", "Quantly", "Meridian Labs",
             "Finserv Co", "RetailIQ", "HealthGrid", "Streamline", "Corevana",
             "Nexa Systems", "BrightPath", "Datastack", "Verdant"]
DEGREES = ["B.Tech Computer Science", "B.E. Information Technology",
           "M.Sc Statistics", "MCA", "B.Sc Mathematics", "M.Tech Data Science"]
VERBS = ["Built", "Designed", "Automated", "Optimized", "Led", "Reduced",
         "Migrated", "Developed", "Scaled", "Delivered", "Engineered", "Owned"]
SCOPES = ["across 12 source systems", "for 40+ business users", "serving 3 regions",
          "processing 1M+ rows daily", "handling 500+ daily jobs",
          "for a 5-person team", "across 8 dashboards", "on a 20 TB warehouse"]
OUTCOMES = ["cutting run time 45%", "saving ~10 hours/week", "improving accuracy to 99%",
            "reducing costs 30%", "lifting adoption 3x", "eliminating manual reconciliation",
            "shrinking latency from hours to minutes", "raising data freshness to near-real-time"]

# Per-role bullet objects — the concrete "what", named tools included so the
# text carries the same skill signal the extractor keys on.
ROLE_BULLET_OBJECTS: dict[str, list[str]] = {
    "Data Engineer": ["ETL pipelines in Apache Spark and Airflow", "a Medallion architecture on Databricks",
                      "streaming ingestion with Kafka", "a Snowflake data warehouse with dbt models"],
    "Data Analyst": ["executive KPI dashboards in Power BI", "ad-hoc SQL analysis for stakeholders",
                     "cohort analysis in Python and Pandas", "self-serve Tableau reports"],
    "Analytics Engineer": ["a dbt project with 80+ tested models", "a semantic layer over BigQuery",
                           "incremental models in Snowflake", "data quality tests in dbt"],
    "Power BI Developer": ["Power BI dashboards with complex DAX measures", "a star-schema model for reporting",
                           "row-level security in Power BI", "paginated KPI reports"],
    "Data Scientist": ["a churn model with scikit-learn", "time-series forecasts for demand",
                       "an NLP classifier for support tickets", "A/B test analysis in Python"],
    "Machine Learning Engineer": ["a training pipeline in PyTorch", "model serving with MLOps tooling",
                                  "feature stores for real-time inference", "a TensorFlow recommender"],
    "AI Engineer": ["a RAG pipeline over internal docs", "LLM integration with prompt engineering",
                    "an embeddings search service", "a GenAI assistant with guardrails"],
    "Backend Developer": ["REST APIs in FastAPI", "a Django service with PostgreSQL",
                          "GraphQL endpoints in Node.js", "async job processing with Redis"],
    "Frontend Developer": ["a React and Next.js dashboard", "a component library in TypeScript",
                           "responsive UIs with accessibility", "a design-system migration"],
    "Full Stack Developer": ["a Next.js app with a Node.js API", "end-to-end features from React to PostgreSQL",
                             "REST APIs and a React frontend", "a full CRUD product with MongoDB"],
    "DevOps Engineer": ["CI/CD pipelines in Jenkins", "Kubernetes deployments with Terraform",
                        "containerized services in Docker", "infrastructure-as-code on AWS"],
    "Cloud Engineer": ["a multi-account AWS landing zone", "Azure infrastructure with Terraform",
                       "a GCP migration", "cost-optimized cloud workloads"],
    "Business Analyst": ["requirement workshops with stakeholders", "KPI reporting in Excel and Power BI",
                         "process mapping and gap analysis", "SQL-based ad-hoc reporting"],
}

# Domain phrases let a summary describe the specialization WITHOUT naming the
# role — so the model must infer role from skills/experience, not read the label.
ROLE_DOMAIN: dict[str, str] = {
    "Data Engineer": "building batch and streaming data pipelines",
    "Data Analyst": "turning data into dashboards and stakeholder insight",
    "Analytics Engineer": "modeling clean, tested analytics data",
    "Power BI Developer": "building governed BI dashboards and reporting",
    "Data Scientist": "building predictive and statistical models",
    "Machine Learning Engineer": "shipping ML models to production",
    "AI Engineer": "building LLM and generative-AI applications",
    "Backend Developer": "designing APIs and backend services",
    "Frontend Developer": "building modern web interfaces",
    "Full Stack Developer": "shipping features across the full web stack",
    "DevOps Engineer": "automating delivery and cloud infrastructure",
    "Cloud Engineer": "designing and running cloud infrastructure",
    "Business Analyst": "bridging business needs and data",
}
# Generic/adjacent titles that DON'T echo the label, mixed in so the title isn't
# a giveaway on ~half the resumes (real resumes often use vague/att titles).
GENERIC_TITLES = ["Software Engineer", "Consultant", "Associate", "Specialist",
                  "Analyst", "Engineer", "Developer", "Technical Associate"]
SENIORITY = ["", "Junior ", "Senior ", "Lead "]


def _skills_for(role: str, rng: random.Random) -> list[str]:
    """Signal skills for the role (weighted toward its triggers) + a little noise."""
    triggers = list(ROLE_TRIGGERS.get(role, {}).keys())
    triggers = [s for s in triggers if s in SKILLS]  # keep only known skills
    k = min(len(triggers), rng.randint(4, 7))
    chosen = rng.sample(triggers, k) if triggers else []
    # 1-3 noise skills so roles aren't linearly trivial to separate
    noise = [s for s in rng.sample(ALL_SKILLS, 3) if s not in chosen][: rng.randint(1, 3)]
    out = chosen + noise
    rng.shuffle(out)
    return out


def _bullet(role: str, rng: random.Random) -> str:
    obj = rng.choice(ROLE_BULLET_OBJECTS[role])
    parts = [rng.choice(VERBS), obj]
    if rng.random() < 0.7:
        parts.append(rng.choice(SCOPES))
    if rng.random() < 0.7:
        parts.append(rng.choice(OUTCOMES))
    return "- " + " ".join(parts) + "."


def _summary(role: str, skills: list[str], rng: random.Random) -> str:
    """~55% of resumes describe the specialization WITHOUT naming the role, so the
    classifier can't just read the label — it must learn from the skill signal."""
    tail = (f"experience in {', '.join(skills[:3])} and a track record of shipping "
            f"production work.")
    if rng.random() < 0.45:
        return f"{role} with hands-on {tail}"                      # states the role
    return f"Engineer focused on {ROLE_DOMAIN[role]}, with hands-on {tail}"  # doesn't


def _title(role: str, rng: random.Random) -> str:
    """Half the time use the real role title; half the time a generic/adjacent
    title, mirroring real resumes where the title rarely equals the target role."""
    base = role if rng.random() < 0.5 else rng.choice(GENERIC_TITLES)
    return rng.choice(SENIORITY) + base


def make_resume(role: str, rng: random.Random) -> dict:
    name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
    city = rng.choice(CITIES)
    skills = _skills_for(role, rng)
    n_jobs = rng.randint(1, 3)
    lines = [
        name,
        f"{name.lower().replace(' ', '.')}@example.com | +91-9{rng.randint(100000000, 999999999)} | {city}",
        "",
        "SUMMARY",
        _summary(role, skills, rng),
        "",
        "SKILLS",
        ", ".join(skills),
        "",
        "EXPERIENCE",
    ]
    for j in range(n_jobs):
        title = _title(role, rng)
        company = rng.choice(COMPANIES)
        y2 = 2025 - j * 2
        y1 = y2 - rng.randint(1, 3)
        lines.append(f"{title} — {company} ({y1}–{y2 if j else 'Present'})")
        for _ in range(rng.randint(2, 4)):
            lines.append(_bullet(role, rng))
        lines.append("")
    lines += ["EDUCATION", f"{rng.choice(DEGREES)} — {rng.choice(CITIES)} University"]
    return {"text": "\n".join(lines), "role": role, "skills": skills}


def generate(n: int, seed: int = 7) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for i in range(n):
        role = TARGET_ROLES[i % len(TARGET_ROLES)]  # balanced across roles
        rows.append(make_resume(role, rng))
    rng.shuffle(rows)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=600)
    ap.add_argument("--out", default="ml/data/resumes.jsonl")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--sample", type=int, default=0, help="print N samples to stdout and exit")
    args = ap.parse_args()

    rows = generate(args.n, args.seed)

    if args.sample:
        from collections import Counter
        dist = Counter(r["role"] for r in rows)
        print(f"# {len(rows)} resumes across {len(dist)} roles — balance: {dict(dist)}\n")
        for r in rows[: args.sample]:
            print(f"===== label: {r['role']}  |  skills: {r['skills']} =====")
            print(r["text"])
            print()
        return

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"Wrote {len(rows)} labeled resumes -> {args.out}")


if __name__ == "__main__":
    main()

/**
 * Tests for the deterministic ATS engine.
 *
 * The assertions that matter most are the fairness ones: the score must not
 * punish a senior engineer for having no "Projects" section, must not invent a
 * keyword score with no job description to match against, and must stay
 * reproducible — a score someone acts on has to mean the same thing twice.
 */
import { describe, expect, it } from "vitest";
import { scoreAts, type AtsCategoryId } from "@/lib/ats/engine";
import { emptyStructuredResume, type StructuredResume } from "@/lib/resumeTypes";

const RESUME_TEXT = `Abhinav Giri Goswami
abhinav@example.com | +91-9876543210 | Hyderabad

PROFESSIONAL SUMMARY
Data engineer building ETL pipelines.

TECHNICAL SKILLS
SQL, Python, Power BI, DAX, Oracle ODI, ETL, Snowflake, Apache Airflow

PROFESSIONAL EXPERIENCE
Associate Analyst — Deloitte (Jan 2021 - Present)
- Built ETL load plans in Oracle ODI processing 500+ PVOs daily.
- Developed Power BI dashboards with DAX measures over 1M+ rows.

EDUCATION
B.Tech Computer Science - JNTU (2017 - 2021)`;

function structured(overrides: Partial<StructuredResume> = {}): StructuredResume {
  return {
    ...emptyStructuredResume(),
    contact: { name: "A", email: "a@b.com", phone: "123", location: "", linkedin: "", portfolio: "" },
    skills: ["SQL", "Python", "Power BI", "DAX", "Oracle ODI", "ETL", "Snowflake", "Apache Airflow"],
    experience: [
      {
        title: "Associate Analyst",
        company: "Deloitte",
        location: "",
        startDate: "Jan 2021",
        endDate: "Present",
        bullets: [
          "Built ETL load plans in Oracle ODI processing 500+ PVOs daily",
          "Developed Power BI dashboards with DAX measures over 1M+ rows",
        ],
      },
    ],
    ...overrides,
  };
}

const cat = (r: ReturnType<typeof scoreAts>, id: AtsCategoryId) =>
  r.categories.find((c) => c.id === id)!;

describe("scoring model", () => {
  it("returns all nine categories", () => {
    const ids = scoreAts(RESUME_TEXT, structured()).categories.map((c) => c.id);
    expect(ids).toEqual([
      "atsCompatibility", "contact", "formatting", "keywords",
      "experience", "achievements", "skills", "projects", "grammar",
    ]);
  });

  it("weights sum to 100 across all categories", () => {
    const total = scoreAts(RESUME_TEXT, structured()).categories.reduce((n, c) => n + c.maxScore, 0);
    expect(total).toBe(100);
  });

  it("computes the overall from applicable categories only", () => {
    const r = scoreAts(RESUME_TEXT, structured());
    const applicable = r.categories.filter((c) => c.applicable);
    const earned = applicable.reduce((n, c) => n + c.score, 0);
    const possible = applicable.reduce((n, c) => n + c.maxScore, 0);
    expect(r.overall).toBe(Math.round((earned / possible) * 100));
  });

  it("is deterministic — the same input always scores the same", () => {
    const a = scoreAts(RESUME_TEXT, structured()).overall;
    const b = scoreAts(RESUME_TEXT, structured()).overall;
    expect(a).toBe(b);
  });

  it("never leaves a category score above its maximum", () => {
    for (const c of scoreAts(RESUME_TEXT, structured()).categories) {
      expect(c.score).toBeLessThanOrEqual(c.maxScore);
      expect(c.score).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("fairness", () => {
  it("does NOT penalize an experienced candidate for having no projects", () => {
    const r = scoreAts(RESUME_TEXT, structured());
    expect(cat(r, "projects").applicable).toBe(false);
    expect(r.categories.filter((c) => c.applicable).reduce((n, c) => n + c.maxScore, 0)).toBe(80);
  });

  it("DOES count projects when there is no work experience", () => {
    const r = scoreAts(RESUME_TEXT, structured({ experience: [] }));
    expect(cat(r, "projects").applicable).toBe(true);
  });

  it("marks Keywords not applicable when no job description is given", () => {
    const r = scoreAts(RESUME_TEXT, structured());
    expect(r.jdAware).toBe(false);
    expect(cat(r, "keywords").applicable).toBe(false);
    // Crucially it does not score 0 and drag the overall down.
    expect(cat(r, "keywords").score).toBe(0);
  });

  it("scores Keywords once a job description is supplied", () => {
    const jd = "Data Engineer. Required: Python, SQL, Apache Airflow and Snowflake experience.";
    const r = scoreAts(RESUME_TEXT, structured(), { jdText: jd });
    expect(r.jdAware).toBe(true);
    expect(cat(r, "keywords").applicable).toBe(true);
    expect(cat(r, "keywords").score).toBeGreaterThan(0);
  });

  it("scores lower against a job description the resume doesn't match", () => {
    const mismatch = "Frontend Engineer. Required: React, TypeScript, Next.js and GraphQL.";
    const withJd = scoreAts(RESUME_TEXT, structured(), { jdText: mismatch }).overall;
    const withoutJd = scoreAts(RESUME_TEXT, structured()).overall;
    expect(withJd).toBeLessThan(withoutJd);
  });
});

describe("category behaviour", () => {
  it("penalizes a passive bullet opener", () => {
    const strong = scoreAts(RESUME_TEXT, structured());
    const passive = scoreAts(
      RESUME_TEXT,
      structured({
        experience: [
          {
            ...structured().experience[0],
            bullets: [
              "Built ETL load plans in Oracle ODI processing 500+ PVOs daily",
              "Responsible for managing the 200+ data quality checks",
            ],
          },
        ],
      })
    );
    expect(cat(passive, "achievements").score).toBeLessThan(cat(strong, "achievements").score);
  });

  it("flags missing contact details", () => {
    const r = scoreAts("SUMMARY\nNo way to reach this person at all.", structured());
    expect(cat(r, "contact").score).toBe(0);
  });

  it("flags table/column extraction artifacts", () => {
    const messy = "Name\nA    B    C\nD    E    F";
    expect(cat(scoreAts(messy, structured()), "atsCompatibility").score).toBeLessThan(15);
  });

  it("flags roles that are missing dates or an employer", () => {
    const r = scoreAts(
      RESUME_TEXT,
      structured({
        experience: [
          { title: "Analyst", company: "", location: "", startDate: "", endDate: "", bullets: ["Did a thing with SQL"] },
        ],
      })
    );
    expect(cat(r, "experience").score).toBeLessThan(15);
  });

  it("surfaces the highest-impact fixes first", () => {
    const r = scoreAts("SUMMARY\nShort.", emptyStructuredResume());
    expect(r.topFixes.length).toBeGreaterThan(0);
    const points = r.topFixes.map((f) => f.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(r.topFixes.length).toBeLessThanOrEqual(5);
  });

  it("handles an empty resume without throwing", () => {
    const r = scoreAts("", emptyStructuredResume());
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
  });

  it("gives every check a human-readable detail", () => {
    for (const c of scoreAts(RESUME_TEXT, structured()).categories) {
      expect(c.rationale.length).toBeGreaterThan(10);
      for (const chk of c.checks) expect(chk.detail.length).toBeGreaterThan(5);
    }
  });
});

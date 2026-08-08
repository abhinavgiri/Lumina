/**
 * CHARACTERIZATION tests for the local AI engine — the scoring brain.
 *
 * These pin what the code ACTUALLY DOES TODAY, quirks and known bugs included.
 * They are not a claim that current behavior is ideal. Their job is to make any
 * behavior change during the V2 refactor fail loudly instead of silently.
 *
 * If one fails after a refactor: did you intend the change?
 *   intended   -> update the expected value in the same commit and say why
 *   unintended -> you just caught a regression
 *
 * Every number here was captured by running the current code, not hand-written.
 * Cases marked "QUIRK PINNED" record behavior that is arguably wrong — pinned so
 * that fixing it is a deliberate, visible decision.
 */
import { describe, expect, it } from "vitest";
import {
  LocalAiEngine,
  matchAgainstJd,
  parseRawToStructured,
  suggestJobQuery,
} from "@/lib/ai/localEngine";
import { runFormatChecks } from "@/lib/formatChecks";

/** A realistic BI/data resume — the profile the app was built around. */
const RESUME = `Abhinav Giri Goswami
abhinav@example.com | +91-9876543210 | Hyderabad, India

PROFESSIONAL SUMMARY
Data Engineer with 4 years of experience building ETL pipelines.

TECHNICAL SKILLS
SQL, Power BI, DAX, Oracle ODI, ETL, Python, Azure Data Factory

PROFESSIONAL EXPERIENCE
Associate Analyst — Deloitte (2021 - Present)
- Built ETL load plans in Oracle ODI processing 500+ PVOs daily.
- Developed Power BI dashboards with DAX measures over 1M+ rows.
- Responsible for managing data quality checks.

EDUCATION
B.Tech Computer Science - JNTU Hyderabad (2017 - 2021)`;

const JD = `Data Engineer
Required: 5+ years experience with Python, Spark, Airflow, Snowflake and SQL.
Must have a Bachelor's degree.
Nice to have: dbt, AWS.`;

// ---------------------------------------------------------------------------
// Format checks (40 pts) — the ATS-parseability half of the score
// ---------------------------------------------------------------------------

describe("runFormatChecks", () => {
  it("scores the reference resume at 36/40 with a pinned breakdown", () => {
    const r = runFormatChecks(RESUME);
    expect(r.score).toBe(36);
    expect(r.maxScore).toBe(40);
    expect(r.items.map((i) => [i.id, i.points])).toEqual([
      ["sections", 8],
      ["contact", 8],
      ["contact-position", 8],
      ["length", 4], // under 150 words -> half marks
      ["clean-extraction", 8],
    ]);
  });

  it("awards partial section credit proportionally", () => {
    const r = runFormatChecks("EXPERIENCE\nDid things.\nEDUCATION\nStudied things.");
    expect(r.items.find((i) => i.id === "sections")?.points).toBe(4); // 2 of 4 headings
  });

  it("zeroes contact points when no email or phone is present", () => {
    const r = runFormatChecks("SUMMARY\nA resume with no contact details at all.");
    const contact = r.items.find((i) => i.id === "contact");
    expect(contact?.points).toBe(0);
    expect(contact?.passed).toBe(false);
  });

  it("flags multi-column extraction artifacts", () => {
    const messy = `Name\nA    B    C\nD    E    F`; // 4+ spaces => artifact heuristic
    expect(runFormatChecks(messy).items.find((i) => i.id === "clean-extraction")?.points).toBe(0);
  });

  it("QUIRK PINNED: empty input still scores 8/40", () => {
    // "No tables/columns/text-box artifacts" passes VACUOUSLY on empty text —
    // there are no lines, so no artifacts are found. An empty resume therefore
    // never scores a true zero. Pinned so a fix is a deliberate decision.
    const r = runFormatChecks("");
    expect(r.score).toBe(8);
    expect(r.items.map((i) => [i.id, i.points])).toEqual([
      ["sections", 0],
      ["contact", 0],
      ["contact-position", 0],
      ["length", 0],
      ["clean-extraction", 8],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Resume analysis — the headline ATS number
// ---------------------------------------------------------------------------

describe("LocalAiEngine.analyzeResume", () => {
  it("pins the overall ATS score and content subscores", async () => {
    const a = await new LocalAiEngine().analyzeResume(RESUME);

    // UPDATED 2026-08-08 (intended): atsScore now comes from the nine-category
    // ATS engine (lib/ats/engine.ts) rather than format(40) + content(60).
    // Without a job description the Keywords category is not applicable, so the
    // overall is computed over the categories that could actually be measured.
    expect(a.atsScore).toBe(90);
    expect(a.resumeQuality).toBe(77);
    expect(a.content.score).toBe(46);
    expect(a.content.maxScore).toBe(60);
    expect(a.content.subscores).toEqual({
      quantifiedAchievements: 15, // all bullets carry numbers -> full marks
      actionVerbs: 5, // dragged down by "Responsible for managing"
      clearTitlesAndDates: 7, // only 2 date signals detected
      skillCoverage: 9,
      noVagueFiller: 10,
    });
  });

  it("reports the weak bullet opener and date issues, in order", async () => {
    const a = await new LocalAiEngine().analyzeResume(RESUME);
    expect(a.content.issues.map((i) => i.category)).toEqual([
      "Weak bullet openers",
      "Titles & dates",
    ]);
  });

  it("detects the grammar/consistency issues present in the reference resume", async () => {
    const a = await new LocalAiEngine().analyzeResume(RESUME);
    expect(a.grammar.map((g) => g.type)).toEqual(["Spacing", "Punctuation consistency"]);
  });

  it("always produces strengths, weaknesses and suggestions", async () => {
    const a = await new LocalAiEngine().analyzeResume(RESUME);
    expect(a.strengths.length).toBeGreaterThan(0);
    expect(a.weaknesses.length).toBeGreaterThan(0);
    expect(a.suggestions.length).toBeGreaterThan(0);
    expect(new Set(a.suggestions).size).toBe(a.suggestions.length); // de-duplicated
  });

  it("omits jdMatch unless a JD of at least 30 chars is supplied", async () => {
    const engine = new LocalAiEngine();
    expect((await engine.analyzeResume(RESUME)).jdMatch).toBeUndefined();
    expect((await engine.analyzeResume(RESUME, { jdText: "too short" })).jdMatch).toBeUndefined();
    expect((await engine.analyzeResume(RESUME, { jdText: JD })).jdMatch).toBeDefined();
  });

  it("handles empty input without throwing", async () => {
    const a = await new LocalAiEngine().analyzeResume("");
    expect(typeof a.atsScore).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// JD matching
// ---------------------------------------------------------------------------

describe("matchAgainstJd", () => {
  it("pins the match percentage and keyword split", () => {
    // NOTE: keyword ORDER changed (2026-08-08) when the skills dictionary moved
    // to the generated shared/skills.json, which is sorted alphabetically —
    // the old hand-written file was grouped by category. Same skills detected,
    // same match %; only the iteration order differs, and it's now deterministic.
    // This matters because the UI slices these lists (top 5 gaps, top 6 in the
    // roadmap), so the order decides which gaps a user is shown.
    const m = matchAgainstJd(RESUME, JD);
    expect(m.matchPercent).toBe(31);
    expect(m.matchedKeywords).toEqual(["Python", "SQL"]);
    expect(m.missingKeywords).toEqual([
      "Apache Airflow",
      "Apache Spark",
      "AWS",
      "dbt",
      "Snowflake",
    ]);
  });

  it("extracts must-haves from 'Required:' lines including the degree", () => {
    const m = matchAgainstJd(RESUME, JD);
    expect(m.missingMustHaves).toEqual([
      "Apache Airflow",
      "Apache Spark",
      "Snowflake",
      "Bachelor's degree",
    ]);
  });

  it("FIXED (was B8): counts only the experience section, not education dates", () => {
    // This used to read the 2017–2021 degree as work history and report ~9
    // years for a career that started in 2021. Now only the EXPERIENCE section
    // is measured, so it tracks the real job history.
    const m = matchAgainstJd(RESUME, JD);
    expect(m.experienceLevel.jdRequires).toBe("5+ years");
    expect(m.experienceLevel.resumeShows).toMatch(/^~[5-7] years$/);
  });

  it("FIXED (was B8): the JD experience mismatch is no longer suppressed", () => {
    // The whole point of the number: warning someone the role wants more years
    // than they have. Inflated estimates silently hid this.
    const junior = `SUMMARY
Analyst.

PROFESSIONAL EXPERIENCE
Analyst — Acme (2024 - 2025)
- Built Python reporting tools for the finance team.

EDUCATION
B.Tech Computer Science - JNTU (2016 - 2020)`;
    const m = matchAgainstJd(junior, JD);
    expect(m.experienceLevel.mismatch).toBe(true);
    expect(m.summary).toContain("5+ years of experience");
  });

  it("FIXED (was B8): a career break isn't counted as experience", () => {
    // Measuring first-date-to-last-date counted the gap. Merged periods are
    // summed instead.
    const withGap = `PROFESSIONAL EXPERIENCE
Analyst — Acme (Jan 2014 - Jan 2016)
- Built Python tooling for reporting.
Analyst — Beta (Jan 2024 - Jan 2026)
- Built SQL pipelines for finance.`;
    // 2 + 2 years of actual work, not the 12-year span.
    expect(matchAgainstJd(withGap, JD).experienceLevel.resumeShows).toBe("~4 years");
  });

  it("FIXED (was B8): concurrent roles at one employer aren't double counted", () => {
    const concurrent = `PROFESSIONAL EXPERIENCE
Deloitte | Associate Analyst (Jan 2020 - Jan 2024)
Data Engineer (Jan 2022 - Jan 2024)
- Built ETL pipelines in Oracle ODI.
Data Analyst (Jan 2020 - Jan 2022)
- Built Power BI dashboards.`;
    // One continuous 4-year stint, not 4 + 2 + 2.
    expect(matchAgainstJd(concurrent, JD).experienceLevel.resumeShows).toBe("~4 years");
  });

  it("returns an indicative 50% when the JD has no recognizable skills", () => {
    const m = matchAgainstJd(RESUME, "We are looking for a wonderful human being to join us.");
    expect(m.matchPercent).toBe(50);
    expect(m.summary).toContain("didn't contain recognizable skill keywords");
  });

  it("keeps the percentage within 0-100", () => {
    expect(matchAgainstJd(RESUME, JD).matchPercent).toBeGreaterThanOrEqual(0);
    expect(matchAgainstJd(RESUME, RESUME).matchPercent).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Heuristic parser — raw text -> structured resume
// ---------------------------------------------------------------------------

describe("parseRawToStructured", () => {
  it("extracts contact details and skills", () => {
    const s = parseRawToStructured(RESUME);
    expect(s.contact.name).toBe("Abhinav Giri Goswami");
    expect(s.contact.email).toBe("abhinav@example.com");
    expect(s.skills).toEqual([
      "SQL", "Power BI", "DAX", "Oracle ODI", "ETL", "Python", "Azure Data Factory",
    ]);
  });

  it("splits the experience entry with its dates and bullets", () => {
    const [exp] = parseRawToStructured(RESUME).experience;
    expect(exp.title).toBe("Associate Analyst");
    expect(exp.startDate).toBe("2021");
    expect(exp.endDate).toBe("Present");
    expect(exp.bullets).toHaveLength(3);
  });

  it("FIXED (was B9): strips the empty brackets left behind by the date", () => {
    // "Deloitte (2021 - Present)" used to become "Deloitte ()" — and that
    // reached the rendered PDF.
    expect(parseRawToStructured(RESUME).experience[0].company).toBe("Deloitte");
  });

  it("FIXED (was B10): splits education into degree, field, school and dates", () => {
    // The whole line used to land in `degree` with an empty `school`, and
    // `endDate` took the FIRST year (2017, the start) as the completion year.
    const [edu] = parseRawToStructured(RESUME).education;
    expect(edu.degree).toBe("B.Tech");
    expect(edu.field).toBe("Computer Science");
    expect(edu.school).toBe("JNTU Hyderabad");
    expect(edu.startDate).toBe("2017");
    expect(edu.endDate).toBe("2021");
  });

  it("keeps the summary out of the experience section", () => {
    expect(parseRawToStructured(RESUME).summary).toBe(
      "Data Engineer with 4 years of experience building ETL pipelines."
    );
  });

  it("rescues job entries when the EXPERIENCE heading is missing", () => {
    // A real failure mode from PDF extraction: without the heading, date-range
    // blocks would otherwise be swallowed by the summary.
    const noHeading = `Jane Doe\njane@x.com\n\nSUMMARY\nAnalyst.\nAnalyst — Acme (2020 - 2023)\n- Did a thing that was quite useful.`;
    expect(parseRawToStructured(noHeading).experience.length).toBeGreaterThan(0);
  });

  it("handles empty input without throwing", () => {
    const s = parseRawToStructured("");
    expect(s.experience).toEqual([]);
    expect(s.skills).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Job query suggestion
// ---------------------------------------------------------------------------

describe("suggestJobQuery", () => {
  it("prefers an explicit target role, else the role found in the resume", () => {
    expect(suggestJobQuery(RESUME)).toBe("data engineer");
    expect(suggestJobQuery(RESUME, "BI Developer")).toBe("BI Developer");
  });

  it("falls back to top skills, then to a default", () => {
    expect(suggestJobQuery("Skilled in Python and SQL.")).toBe("Python SQL");
    expect(suggestJobQuery("Nothing recognizable here.")).toBe("software engineer");
  });
});

// ---------------------------------------------------------------------------
// Tailoring — must never invent facts
// ---------------------------------------------------------------------------

describe("LocalAiEngine.tailorResume", () => {
  const SIMPLE = `SKILLS
Python, SQL, Tableau
EXPERIENCE
Analyst - Acme (2020 - 2023)
- Built Tableau dashboards.
- Wrote Python scripts.`;

  it("reorders bullets by JD relevance and never adds skills", async () => {
    const t = await new LocalAiEngine().tailorResume(SIMPLE, "Need Python and SQL. Required: Python.", null);
    expect(t.resume.skills).toEqual(["Python", "SQL", "Tableau"]);
    expect(t.changes).toContain("Moved each role's most JD-relevant bullets to the top.");
  });

  it("always states that nothing was invented", async () => {
    const t = await new LocalAiEngine().tailorResume(SIMPLE, "Need Python.", null);
    expect(t.changes).toContain(
      "Kept all employers, titles, dates, and facts exactly as written — nothing was invented."
    );
  });

  it("reports JD skills the resume lacks as gaps rather than adding them", async () => {
    const t = await new LocalAiEngine().tailorResume(SIMPLE, "Required: Snowflake and Kubernetes experience.", null);
    expect(t.gaps.join(" ")).toContain("Snowflake");
    expect(t.resume.skills).not.toContain("Snowflake");
  });
});

// ---------------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------------

describe("LocalAiEngine.generateRoadmap", () => {
  it("marks must-haves high priority and caps the plan at 8 steps", async () => {
    const r = await new LocalAiEngine().generateRoadmap(
      ["Snowflake", "dbt"], ["Snowflake"], "", "Python SQL"
    );
    expect(r.steps.map((s) => [s.skill, s.priority])).toEqual([
      ["Snowflake", "high"],
      ["dbt", "medium"],
    ]);
    expect(r.steps.length).toBeLessThanOrEqual(8);
    expect(r.projectIdeas.length).toBeGreaterThan(0);
  });

  it("says so plainly when there are no gaps", async () => {
    const r = await new LocalAiEngine().generateRoadmap([], [], "", "Python");
    expect(r.steps).toEqual([]);
    expect(r.projectIdeas[0]).toContain("No significant skill gaps");
  });
});

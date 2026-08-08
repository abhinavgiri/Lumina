/**
 * Tests for the deterministic Resume Intelligence layer.
 *
 * The critical assertions are the TRUTHFULNESS rules: keyword suggestions must
 * come from the user's own text, and grading must be explainable — a bullet is
 * only "strong" when it actually does all three jobs.
 */
import { describe, expect, it } from "vitest";
import { emptyStructuredResume, type StructuredResume } from "@/lib/resumeTypes";
import { analyzeResumeIntelligence } from "@/lib/resume/intelligence";

function resumeWith(overrides: Partial<StructuredResume>): StructuredResume {
  return { ...emptyStructuredResume(), ...overrides };
}

const role = (bullets: string[], extra: Partial<StructuredResume["experience"][number]> = {}) => ({
  title: "Data Engineer",
  company: "Acme",
  location: "",
  startDate: "Jan 2021",
  endDate: "Dec 2023",
  bullets,
  ...extra,
});

describe("bullet grading", () => {
  it("grades a bullet strong only when it has verb + specifics + outcome", () => {
    const r = resumeWith({
      experience: [
        role(["Built ETL pipelines in Apache Spark and Airflow, cutting run time by 45%"]),
      ],
    });
    const [b] = analyzeResumeIntelligence(r).bullets;
    expect(b.grade).toBe("strong");
    expect(b.hasActionVerb).toBe(true);
    expect(b.hasSpecifics).toBe(true);
    expect(b.hasMetric).toBe(true);
    expect(b.issues).toEqual([]);
  });

  it("downgrades a bullet with no measurable outcome and says why", () => {
    const r = resumeWith({ experience: [role(["Built ETL pipelines in Apache Spark and Airflow"])] });
    const [b] = analyzeResumeIntelligence(r).bullets;
    expect(b.grade).toBe("adequate");
    expect(b.hasMetric).toBe(false);
    expect(b.issues.join(" ")).toContain("No measurable outcome");
  });

  it("flags passive openers as weak with a concrete rewrite hint", () => {
    const r = resumeWith({ experience: [role(["Responsible for managing the SQL data quality checks"])] });
    const [b] = analyzeResumeIntelligence(r).bullets;
    expect(b.grade).toBe("weak");
    expect(b.issues.join(" ")).toContain("Starts passively");
  });

  it("flags a bullet that names no tools as generic", () => {
    const r = resumeWith({ experience: [role(["Improved things for the team over the last year"])] });
    const [b] = analyzeResumeIntelligence(r).bullets;
    expect(b.hasSpecifics).toBe(false);
    expect(b.issues.join(" ")).toContain("Doesn't name the tools");
  });

  it("counts scale words as outcomes even without a digit", () => {
    const r = resumeWith({ experience: [role(["Automated Python reporting, eliminating manual reconciliation"])] });
    expect(analyzeResumeIntelligence(r).bullets[0].hasMetric).toBe(true);
  });

  it("attributes each bullet to its role", () => {
    const r = resumeWith({ experience: [role(["Built Python tooling"], { title: "Analyst", company: "Beta" })] });
    expect(analyzeResumeIntelligence(r).bullets[0].role).toBe("Analyst · Beta");
  });

  it("summarizes counts and produces a headline", () => {
    const r = resumeWith({
      experience: [
        role([
          "Built ETL pipelines in Apache Spark, cutting run time 45%",
          "Responsible for various tasks",
        ]),
      ],
    });
    const out = analyzeResumeIntelligence(r);
    expect(out.counts.strong).toBe(1);
    expect(out.counts.weak).toBe(1);
    expect(out.headline).toContain("1 of 2");
  });

  it("handles an empty resume without throwing", () => {
    const out = analyzeResumeIntelligence(emptyStructuredResume());
    expect(out.bullets).toEqual([]);
    expect(out.headline).toContain("No experience bullets");
  });
});

describe("keyword opportunities (truthful enrichment)", () => {
  it("surfaces skills proven in the bullets but missing from the skills list", () => {
    const r = resumeWith({
      skills: ["SQL"],
      experience: [role(["Built pipelines in Apache Airflow and Snowflake to load 1M+ rows"])],
    });
    const skills = analyzeResumeIntelligence(r).keywordOpportunities.map((k) => k.skill);
    expect(skills).toContain("Apache Airflow");
    expect(skills).toContain("Snowflake");
    expect(skills).not.toContain("SQL"); // already listed
  });

  it("NEVER invents: suggests nothing when the text proves nothing", () => {
    const r = resumeWith({
      skills: ["SQL"],
      experience: [role(["Worked with the team on various improvements"])],
    });
    expect(analyzeResumeIntelligence(r).keywordOpportunities).toEqual([]);
  });

  it("includes the user's own sentence as evidence", () => {
    const r = resumeWith({
      skills: [],
      experience: [role(["Built dashboards in Power BI using DAX measures"])],
    });
    const hit = analyzeResumeIntelligence(r).keywordOpportunities.find((k) => k.skill === "Power BI");
    expect(hit?.evidence).toContain("Power BI");
  });

  it("also reads project text, not just experience", () => {
    const r = resumeWith({
      skills: [],
      projects: [{ name: "P", description: "A Kubernetes deployment demo", bullets: [], tech: [] }],
    });
    expect(analyzeResumeIntelligence(r).keywordOpportunities.map((k) => k.skill)).toContain("Kubernetes");
  });
});

describe("consistency checks", () => {
  it("flags mixed verb tense", () => {
    const r = resumeWith({
      experience: [role(["Built Python pipelines daily", "Building SQL reports for the team"])],
    });
    const types = analyzeResumeIntelligence(r).consistency.map((c) => c.type);
    expect(types).toContain("Verb tense");
  });

  it("flags inconsistent trailing punctuation", () => {
    const r = resumeWith({
      experience: [role(["Built A with Python.", "Built B with SQL", "Built C with AWS", "Built D with Azure"])],
    });
    expect(analyzeResumeIntelligence(r).consistency.map((c) => c.type)).toContain("Punctuation");
  });

  it("flags inconsistent date formats across roles", () => {
    const r = resumeWith({
      experience: [
        role(["Built Python tools"], { startDate: "Jan 2021", endDate: "Dec 2022" }),
        role(["Built SQL tools"], { startDate: "2019", endDate: "2020" }),
      ],
    });
    expect(analyzeResumeIntelligence(r).consistency.map((c) => c.type)).toContain("Date format");
  });

  it("flags a role with no bullets", () => {
    const r = resumeWith({ experience: [role([])] });
    expect(analyzeResumeIntelligence(r).consistency.map((c) => c.type)).toContain("Empty role");
  });

  it("reports nothing for a clean, consistent resume", () => {
    const r = resumeWith({
      experience: [
        role(["Built Python pipelines", "Automated SQL reporting"], {
          startDate: "Jan 2021",
          endDate: "Dec 2022",
        }),
      ],
    });
    expect(analyzeResumeIntelligence(r).consistency).toEqual([]);
  });
});

describe("section ordering", () => {
  it("keeps experience first by default", () => {
    const r = resumeWith({ experience: [role(["Built Python pipelines with Spark"])] });
    const { order, reason } = analyzeResumeIntelligence(r).sections;
    expect(order.indexOf("Experience")).toBeLessThan(order.indexOf("Projects"));
    expect(reason).toContain("Standard order");
  });

  it("leads with projects when there is no work experience", () => {
    const r = resumeWith({
      projects: [{ name: "P", description: "", bullets: ["Built a Python app"], tech: [] }],
    });
    const { order } = analyzeResumeIntelligence(r).sections;
    expect(order.indexOf("Projects")).toBeLessThan(order.indexOf("Experience"));
  });

  it("leads with projects when they carry more evidence than the work history", () => {
    const r = resumeWith({
      experience: [role(["One thin bullet"])],
      projects: [
        { name: "P", description: "", bullets: ["a", "b", "c", "d", "e"], tech: [] },
      ],
    });
    const { order, reason } = analyzeResumeIntelligence(r).sections;
    expect(order.indexOf("Projects")).toBeLessThan(order.indexOf("Experience"));
    expect(reason).toContain("projects show more detail");
  });
});

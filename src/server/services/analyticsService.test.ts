/**
 * Tests for career analytics.
 *
 * The important assertions here are the HONESTY rules: a single report is not a
 * trend, malformed stored JSON must not take the dashboard down, and a skill
 * mentioned many times in one job description must not look like a recurring
 * gap across many.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  atsReport: { findMany: vi.fn() },
  application: { groupBy: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: db }));

const { getAnalytics } = await import("@/server/services/analyticsService");

const report = (score: number, day: number, jdMatch?: unknown) => ({
  score,
  createdAt: new Date(Date.UTC(2026, 0, day)),
  jobDescId: jdMatch ? "jd1" : null,
  breakdownJson: JSON.stringify({ atsScore: score, jdMatch }),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.application.groupBy.mockResolvedValue([]);
});

describe("score trend", () => {
  it("reports latest, best and the change since the first analysis", async () => {
    db.atsReport.findMany.mockResolvedValue([report(70, 1), report(85, 2), report(80, 3)]);

    const { scoreTrend } = await getAnalytics("u1");
    expect(scoreTrend.latest).toBe(80);
    expect(scoreTrend.best).toBe(85);
    expect(scoreTrend.delta).toBe(10); // 80 - 70
    expect(scoreTrend.points).toHaveLength(3);
  });

  it("HONESTY: a single report has no delta — one reading is not a trend", async () => {
    db.atsReport.findMany.mockResolvedValue([report(72, 1)]);

    const { scoreTrend } = await getAnalytics("u1");
    expect(scoreTrend.latest).toBe(72);
    expect(scoreTrend.delta).toBeNull(); // not 0, which would imply "no change"
  });

  it("reports a decline honestly rather than hiding it", async () => {
    db.atsReport.findMany.mockResolvedValue([report(90, 1), report(75, 2)]);
    expect((await getAnalytics("u1")).scoreTrend.delta).toBe(-15);
  });

  it("returns empty values when there is no history at all", async () => {
    db.atsReport.findMany.mockResolvedValue([]);

    const a = await getAnalytics("u1");
    expect(a.scoreTrend).toEqual({ points: [], latest: null, best: null, delta: null });
    expect(a.totalAnalyses).toBe(0);
    expect(a.recurringGaps).toEqual([]);
  });
});

describe("recurring gaps", () => {
  it("counts how many job descriptions each missing skill appeared in", async () => {
    db.atsReport.findMany.mockResolvedValue([
      report(70, 1, { missingKeywords: ["Snowflake", "dbt"], missingMustHaves: [] }),
      report(72, 2, { missingKeywords: ["Snowflake", "AWS"], missingMustHaves: [] }),
      report(75, 3, { missingKeywords: ["Snowflake"], missingMustHaves: [] }),
    ]);

    const { recurringGaps, analysedJobDescriptions } = await getAnalytics("u1");
    expect(analysedJobDescriptions).toBe(3);
    expect(recurringGaps[0]).toEqual({ skill: "Snowflake", count: 3, mustHave: false });
    expect(recurringGaps.map((g) => g.skill)).toContain("dbt");
  });

  it("ranks stated must-haves above merely frequent keywords", async () => {
    db.atsReport.findMany.mockResolvedValue([
      report(70, 1, { missingKeywords: ["Kafka", "Docker"], missingMustHaves: [] }),
      report(70, 2, { missingKeywords: ["Kafka", "Docker"], missingMustHaves: [] }),
      report(70, 3, { missingKeywords: ["Spark"], missingMustHaves: ["Spark"] }),
    ]);

    const { recurringGaps } = await getAnalytics("u1");
    // Spark appears once but is a stated requirement, so it leads.
    expect(recurringGaps[0]).toEqual({ skill: "Spark", count: 1, mustHave: true });
  });

  it("counts a skill once per report, so one JD cannot dominate", async () => {
    db.atsReport.findMany.mockResolvedValue([
      report(70, 1, {
        missingKeywords: ["Snowflake", "Snowflake", "Snowflake"],
        missingMustHaves: [],
      }),
    ]);
    expect((await getAnalytics("u1")).recurringGaps[0].count).toBe(1);
  });

  it("ignores reports with no JD match", async () => {
    db.atsReport.findMany.mockResolvedValue([report(70, 1), report(80, 2)]);

    const a = await getAnalytics("u1");
    expect(a.analysedJobDescriptions).toBe(0);
    expect(a.recurringGaps).toEqual([]);
    expect(a.totalAnalyses).toBe(2); // still counted as analyses
  });

  it("survives malformed stored JSON instead of crashing the dashboard", async () => {
    db.atsReport.findMany.mockResolvedValue([
      { score: 70, createdAt: new Date(), jobDescId: "x", breakdownJson: "{not json" },
      report(80, 2, { missingKeywords: ["dbt"], missingMustHaves: [] }),
    ]);

    const a = await getAnalytics("u1");
    expect(a.totalAnalyses).toBe(2);
    expect(a.analysedJobDescriptions).toBe(1); // only the parseable one
    expect(a.recurringGaps[0].skill).toBe("dbt");
  });

  it("caps the list so the UI stays actionable", async () => {
    db.atsReport.findMany.mockResolvedValue([
      report(70, 1, {
        missingKeywords: ["a", "b", "c", "d", "e", "f", "g", "h", "i"],
        missingMustHaves: [],
      }),
    ]);
    expect((await getAnalytics("u1")).recurringGaps.length).toBeLessThanOrEqual(6);
  });
});

describe("application funnel", () => {
  it("is included in the summary", async () => {
    db.atsReport.findMany.mockResolvedValue([]);
    db.application.groupBy.mockResolvedValue([
      { status: "applied", _count: { _all: 4 } },
      { status: "interviewing", _count: { _all: 1 } },
    ]);

    const { applications } = await getAnalytics("u1");
    expect(applications.total).toBe(5);
    expect(applications.interviewRate).toBe(20); // 1 of 5 submitted
  });
});

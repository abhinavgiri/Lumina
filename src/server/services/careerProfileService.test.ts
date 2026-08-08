/**
 * Tests for the Career Profile service.
 *
 * The behaviours worth guarding are the ones about TRUTH over time: a skill's
 * first-seen date must never be rewritten (that's what makes growth real), and
 * logging an interview must not leave the pipeline claiming something different
 * from the interview log.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  careerProfile: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  profileSkill: { findMany: vi.fn(), upsert: vi.fn() },
  learningItem: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  interview: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  application: { findFirst: vi.fn(), update: vi.fn() },
  applicationEvent: { create: vi.fn() },
  resume: { findMany: vi.fn(), findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
};

vi.mock("@/lib/db", () => ({ prisma: db }));

const svc = await import("@/server/services/careerProfileService");

const PROFILE = { id: "p1", userId: "u1", targetRolesJson: null, seniority: null, preferredLocation: null, openToRemote: true, skillsSyncedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.careerProfile.findUnique.mockResolvedValue(PROFILE);
  // The sync now short-circuits unless a resume is newer than skillsSyncedAt,
  // so the newest-resume probe must be mocked for these tests to exercise it.
  db.resume.findFirst.mockResolvedValue({ createdAt: new Date() });
  db.profileSkill.findMany.mockResolvedValue([]);
  db.learningItem.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation(async (ops: unknown[]) => ops);
});

describe("profile", () => {
  it("creates a profile on first access rather than failing", async () => {
    db.careerProfile.findUnique.mockResolvedValue(null);
    db.careerProfile.create.mockResolvedValue(PROFILE);

    await svc.getCareerProfile("u1");
    expect(db.careerProfile.create).toHaveBeenCalledWith({ data: { userId: "u1" } });
  });

  it("stores target roles as JSON and reads them back", async () => {
    db.careerProfile.update.mockResolvedValue(PROFILE);
    db.careerProfile.findUnique.mockResolvedValue({
      ...PROFILE,
      targetRolesJson: JSON.stringify(["Data Engineer", "Analytics Engineer"]),
    });

    const p = await svc.updateCareerProfile("u1", { targetRoles: ["Data Engineer", "Analytics Engineer"] });
    expect(p.targetRoles).toEqual(["Data Engineer", "Analytics Engineer"]);
  });

  it("rejects a non-array targetRoles", async () => {
    await expect(svc.updateCareerProfile("u1", { targetRoles: "Data Engineer" })).rejects.toThrow(
      /must be an array/
    );
  });

  it("survives corrupted targetRoles JSON instead of throwing", async () => {
    db.careerProfile.findUnique.mockResolvedValue({ ...PROFILE, targetRolesJson: "{not json" });
    expect((await svc.getCareerProfile("u1")).targetRoles).toEqual([]);
  });
});

describe("skill history", () => {
  it("preserves firstSeenAt and only moves lastSeenAt forward", async () => {
    db.resume.findMany.mockResolvedValue([
      { rawText: "Built pipelines with Apache Airflow and Snowflake", structuredJson: null },
    ]);

    await svc.syncSkillsFromResumes("u1");

    const calls = db.profileSkill.upsert.mock.calls.map(([arg]) => arg);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      // create sets firstSeenAt by default; update must NOT touch it.
      expect(call.update).toHaveProperty("lastSeenAt");
      expect(call.update).not.toHaveProperty("firstSeenAt");
    }
  });

  it("prefers the curated skills list over raw text when present", async () => {
    db.resume.findMany.mockResolvedValue([
      {
        rawText: "Mentions Kubernetes in passing somewhere in the body text",
        structuredJson: JSON.stringify({
          contact: { name: "", email: "", phone: "", location: "", linkedin: "", portfolio: "" },
          targetRole: "", summary: "", skills: ["Python", "SQL"],
          experience: [], projects: [], certifications: [], education: [],
        }),
      },
    ]);

    await svc.syncSkillsFromResumes("u1");
    const names = db.profileSkill.upsert.mock.calls.map(([a]) => a.create.name);
    expect(names).toContain("Python");
    expect(names).not.toContain("Kubernetes"); // came from prose, not the list
  });

  it("does nothing when no skills can be found", async () => {
    db.resume.findMany.mockResolvedValue([{ rawText: "", structuredJson: null }]);
    db.resume.findFirst.mockResolvedValue({ createdAt: new Date() });
    expect(await svc.syncSkillsFromResumes("u1")).toBe(0);
    expect(db.profileSkill.upsert).not.toHaveBeenCalled();
  });

  it("reports skills first seen recently as growth", async () => {
    const old = new Date("2020-01-01");
    const recent = new Date();
    db.profileSkill.findMany.mockResolvedValue([
      { name: "SQL", source: "resume", proficiency: null, firstSeenAt: old, lastSeenAt: recent },
      { name: "dbt", source: "resume", proficiency: null, firstSeenAt: recent, lastSeenAt: recent },
    ]);

    const p = await svc.getCareerProfile("u1");
    expect(p.recentlyAdded).toEqual(["dbt"]);
  });
});

describe("learning list", () => {
  it("adds a commitment from the roadmap", async () => {
    db.learningItem.findFirst.mockResolvedValue(null);
    db.learningItem.create.mockResolvedValue({
      id: "l1", skill: "Apache Airflow", status: "planned", source: "roadmap", notes: null,
    });

    const item = await svc.addLearningItem("u1", { skill: "Apache Airflow", source: "roadmap" });
    expect(item).toMatchObject({ skill: "Apache Airflow", status: "planned", source: "roadmap" });
  });

  it("refuses to add the same skill twice", async () => {
    db.learningItem.findFirst.mockResolvedValue({ id: "l1", skill: "dbt" });
    await expect(svc.addLearningItem("u1", { skill: "dbt" })).rejects.toThrow(/already on your learning list/);
  });

  it("requires a skill name", async () => {
    await expect(svc.addLearningItem("u1", { skill: "   " })).rejects.toThrow(/Skill is required/);
  });

  it("stamps a completion date when marked done, and clears it when reopened", async () => {
    db.learningItem.findFirst.mockResolvedValue({ id: "l1", profileId: "p1" });
    db.learningItem.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "l1", skill: "dbt", source: "manual", notes: null, targetDate: null,
      status: data.status, completedAt: data.completedAt,
    }));

    const done = await svc.updateLearningItem("u1", "l1", { status: "done" });
    expect(done.completedAt).not.toBeNull();

    const reopened = await svc.updateLearningItem("u1", "l1", { status: "learning" });
    expect(reopened.completedAt).toBeNull();
  });

  it("rejects an unknown status", async () => {
    db.learningItem.findFirst.mockResolvedValue({ id: "l1", profileId: "p1" });
    await expect(svc.updateLearningItem("u1", "l1", { status: "finished" })).rejects.toThrow(/Status must be one of/);
  });

  it("404s on someone else's learning item", async () => {
    db.learningItem.findFirst.mockResolvedValue(null);
    await expect(svc.deleteLearningItem("u1", "nope")).rejects.toThrow(/not found/);
  });
});

describe("interviews", () => {
  beforeEach(() => {
    db.application.findFirst.mockResolvedValue({ id: "a1", userId: "u1", status: "applied", appliedAt: null });
    db.interview.count.mockResolvedValue(0);
    db.interview.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "i1", notes: null, scheduledAt: null, ...data,
    }));
  });

  it("numbers rounds sequentially", async () => {
    db.interview.count.mockResolvedValue(2);
    const i = await svc.addInterview("u1", "a1", { kind: "technical" });
    expect(i.round).toBe(3);
  });

  it("moves the application to interviewing so the pipeline can't disagree", async () => {
    await svc.addInterview("u1", "a1", { kind: "screen" });

    expect(db.application.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "interviewing" }) })
    );
    // …and records the transition in the outcome log.
    expect(db.applicationEvent.create).toHaveBeenCalled();
  });

  it("does not downgrade an application already at offer", async () => {
    db.application.findFirst.mockResolvedValue({ id: "a1", userId: "u1", status: "offer", appliedAt: new Date() });
    await svc.addInterview("u1", "a1", { kind: "final" });
    expect(db.application.update).not.toHaveBeenCalled();
  });

  it("falls back to safe defaults for unknown kind/outcome", async () => {
    const i = await svc.addInterview("u1", "a1", { kind: "hacking", outcome: "vibes" });
    expect(i.kind).toBe("screen");
    expect(i.outcome).toBe("scheduled");
  });

  it("ignores an unparseable scheduledAt rather than storing Invalid Date", async () => {
    const i = await svc.addInterview("u1", "a1", { scheduledAt: "not-a-date" });
    expect(i.scheduledAt).toBeNull();
  });

  it("404s on an application that isn't the user's", async () => {
    db.application.findFirst.mockResolvedValue(null);
    await expect(svc.listInterviews("u1", "a1")).rejects.toThrow(/not found/);
  });
});

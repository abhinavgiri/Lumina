/**
 * Tests for the application pipeline.
 *
 * Prisma is mocked so these run without a database. The behavior that matters
 * most here isn't CRUD — it's that (a) status transitions are LOGGED, because
 * that log is the only real outcome data the product will ever have, and
 * (b) client-supplied resume/JD ids are never trusted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  application: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  },
  applicationEvent: { create: vi.fn() },
  resume: { findFirst: vi.fn() },
  jobDesc: { findFirst: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: db }));

const {
  APPLICATION_STATUSES,
  applicationStats,
  createApplication,
  deleteApplication,
  updateApplication,
} = await import("@/server/services/applicationService");

const row = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  company: "Acme",
  title: "Data Engineer",
  location: null,
  url: null,
  source: null,
  matchPercent: null,
  status: "saved",
  notes: null,
  resumeId: null,
  appliedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.application.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row(data)
  );
  db.application.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    row(data)
  );
  db.resume.findFirst.mockResolvedValue(null);
  db.jobDesc.findFirst.mockResolvedValue(null);
});

describe("createApplication", () => {
  it("defaults to 'saved' and logs the initial status", async () => {
    const app = await createApplication("u1", { company: "Acme", title: "Data Engineer" });

    expect(app.status).toBe("saved");
    const data = db.application.create.mock.calls[0][0].data;
    expect(data.events).toEqual({ create: { status: "saved" } });
    expect(data.appliedAt).toBeNull(); // saved is not yet an application
  });

  it("stamps appliedAt when created directly as applied", async () => {
    await createApplication("u1", { company: "Acme", title: "DE", status: "applied" });
    expect(db.application.create.mock.calls[0][0].data.appliedAt).toBeInstanceOf(Date);
  });

  it("requires company and title", async () => {
    await expect(createApplication("u1", { title: "DE" })).rejects.toThrow("Company is required.");
    await expect(createApplication("u1", { company: "Acme" })).rejects.toThrow(
      "Job title is required."
    );
    await expect(createApplication("u1", { company: "   ", title: "DE" })).rejects.toThrow(
      "Company is required."
    );
  });

  it("rejects an unknown status", async () => {
    await expect(
      createApplication("u1", { company: "Acme", title: "DE", status: "hired" })
    ).rejects.toThrow(/Status must be one of/);
  });

  it("ignores a resumeId that does not belong to the user", async () => {
    // findFirst is scoped by userId and returns null for someone else's resume.
    await createApplication("u1", { company: "Acme", title: "DE", resumeId: "not-mine" });

    expect(db.resume.findFirst).toHaveBeenCalledWith({
      where: { id: "not-mine", userId: "u1" },
      select: { id: true },
    });
    expect(db.application.create.mock.calls[0][0].data.resumeId).toBeNull();
  });

  it("clamps matchPercent into 0..100 and ignores non-numbers", async () => {
    await createApplication("u1", { company: "A", title: "B", matchPercent: 140 });
    expect(db.application.create.mock.calls[0][0].data.matchPercent).toBe(100);

    await createApplication("u1", { company: "A", title: "B", matchPercent: "high" });
    expect(db.application.create.mock.calls[1][0].data.matchPercent).toBeNull();
  });
});

describe("updateApplication", () => {
  it("logs a status transition — this is the outcome data", async () => {
    db.application.findFirst.mockResolvedValue(row({ status: "applied" }));

    await updateApplication("u1", "a1", { status: "interviewing" });

    expect(db.applicationEvent.create).toHaveBeenCalledWith({
      data: { applicationId: "a1", status: "interviewing" },
    });
  });

  it("does NOT log an event when the status is unchanged", async () => {
    db.application.findFirst.mockResolvedValue(row({ status: "applied" }));
    await updateApplication("u1", "a1", { status: "applied" });
    expect(db.applicationEvent.create).not.toHaveBeenCalled();
  });

  it("stamps appliedAt on the first move out of 'saved', and only once", async () => {
    db.application.findFirst.mockResolvedValue(row({ status: "saved", appliedAt: null }));
    await updateApplication("u1", "a1", { status: "applied" });
    expect(db.application.update.mock.calls[0][0].data.appliedAt).toBeInstanceOf(Date);

    const already = new Date("2026-02-02");
    db.application.findFirst.mockResolvedValue(row({ status: "applied", appliedAt: already }));
    await updateApplication("u1", "a1", { status: "interviewing" });
    expect(db.application.update.mock.calls[1][0].data.appliedAt).toBeUndefined();
  });

  it("404s for an application the user does not own", async () => {
    db.application.findFirst.mockResolvedValue(null);
    await expect(updateApplication("u1", "someone-elses", { status: "offer" })).rejects.toThrow(
      "Application not found."
    );
  });

  it("is a no-op when nothing was supplied", async () => {
    db.application.findFirst.mockResolvedValue(row());
    await updateApplication("u1", "a1", {});
    expect(db.application.update).not.toHaveBeenCalled();
  });
});

describe("deleteApplication", () => {
  it("refuses to delete another user's application", async () => {
    db.application.findFirst.mockResolvedValue(null);
    await expect(deleteApplication("u1", "someone-elses")).rejects.toThrow("Application not found.");
    expect(db.application.delete).not.toHaveBeenCalled();
  });
});

describe("applicationStats", () => {
  it("counts every status, including ones with no rows", async () => {
    db.application.groupBy.mockResolvedValue([
      { status: "saved", _count: { _all: 3 } },
      { status: "applied", _count: { _all: 5 } },
    ]);
    const stats = await applicationStats("u1");
    expect(stats.total).toBe(8);
    expect(stats.byStatus).toEqual({
      saved: 3, applied: 5, interviewing: 0, offer: 0, rejected: 0,
    });
  });

  it("computes interview rate over SUBMITTED applications, excluding saved", async () => {
    db.application.groupBy.mockResolvedValue([
      { status: "saved", _count: { _all: 10 } }, // must not dilute the rate
      { status: "applied", _count: { _all: 6 } },
      { status: "interviewing", _count: { _all: 3 } },
      { status: "offer", _count: { _all: 1 } },
    ]);
    // submitted = 10, reached interview = 3 + 1 => 40%
    expect((await applicationStats("u1")).interviewRate).toBe(40);
  });

  it("returns null rather than 0% when nothing has been submitted yet", async () => {
    db.application.groupBy.mockResolvedValue([{ status: "saved", _count: { _all: 4 } }]);
    expect((await applicationStats("u1")).interviewRate).toBeNull();
  });
});

describe("status vocabulary", () => {
  it("is the pipeline the UI renders, in order", () => {
    expect(APPLICATION_STATUSES).toEqual([
      "saved", "applied", "interviewing", "offer", "rejected",
    ]);
  });
});

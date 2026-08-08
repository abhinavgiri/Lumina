/**
 * Application Service — the job pipeline (saved → applied → interviewing →
 * offer/rejected) and the first slice of the Career Profile spine.
 *
 * Every status change is also written to ApplicationEvent. That log is the only
 * source of real hiring OUTCOMES in the product, and outcomes are what a future
 * match/ATS model would need to be trained honestly — see
 * backend/ml/DATA_PROVENANCE.md. Capturing it now costs almost nothing;
 * reconstructing it later is impossible.
 */
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api/response";

export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type ApplicationDto = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  source: string | null;
  matchPercent: number | null;
  status: ApplicationStatus;
  notes: string | null;
  resumeId: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApplicationRow = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  source: string | null;
  matchPercent: number | null;
  status: string;
  notes: string | null;
  resumeId: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const toDto = (a: ApplicationRow): ApplicationDto => ({
  id: a.id,
  company: a.company,
  title: a.title,
  location: a.location,
  url: a.url,
  source: a.source,
  matchPercent: a.matchPercent,
  status: a.status as ApplicationStatus,
  notes: a.notes,
  resumeId: a.resumeId,
  appliedAt: a.appliedAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

function validateStatus(raw: unknown): ApplicationStatus {
  const status = String(raw ?? "");
  if (!(APPLICATION_STATUSES as readonly string[]).includes(status)) {
    throw badRequest(`Status must be one of: ${APPLICATION_STATUSES.join(", ")}.`);
  }
  return status as ApplicationStatus;
}

function requiredText(raw: unknown, field: string, max = 200): string {
  const value = String(raw ?? "").trim();
  if (!value) throw badRequest(`${field} is required.`);
  return value.slice(0, max);
}

const optionalText = (raw: unknown, max = 2000): string | null => {
  const value = String(raw ?? "").trim();
  return value ? value.slice(0, max) : null;
};

export type CreateApplicationInput = {
  company?: unknown;
  title?: unknown;
  location?: unknown;
  url?: unknown;
  source?: unknown;
  matchPercent?: unknown;
  resumeId?: unknown;
  jobDescId?: unknown;
  status?: unknown;
  notes?: unknown;
};

/** Page size for the pipeline list. Unbounded, this response grew to 55KB. */
export const APPLICATIONS_PAGE_SIZE = 50;

export async function listApplications(
  userId: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<{ items: ApplicationDto[]; total: number; hasMore: boolean }> {
  const limit = Math.min(Math.max(1, opts.limit ?? APPLICATIONS_PAGE_SIZE), 200);
  const offset = Math.max(0, opts.offset ?? 0);

  const [rows, total] = await Promise.all([
    prisma.application.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.application.count({ where: { userId } }),
  ]);
  return { items: rows.map(toDto), total, hasMore: offset + rows.length < total };
}

/** Save a job into the pipeline. Defaults to "saved" — one click from a job card. */
export async function createApplication(
  userId: string,
  input: CreateApplicationInput
): Promise<ApplicationDto> {
  const status = input.status === undefined ? "saved" : validateStatus(input.status);
  const company = requiredText(input.company, "Company");
  const title = requiredText(input.title, "Job title");

  // Only link a resume/JD that actually belongs to this user — never trust ids
  // supplied by the client.
  const resumeId = input.resumeId
    ? (await prisma.resume.findFirst({
        where: { id: String(input.resumeId), userId },
        select: { id: true },
      }))?.id ?? null
    : null;
  const jobDescId = input.jobDescId
    ? (await prisma.jobDesc.findFirst({
        where: { id: String(input.jobDescId), userId },
        select: { id: true },
      }))?.id ?? null
    : null;

  const matchPercent =
    typeof input.matchPercent === "number" && Number.isFinite(input.matchPercent)
      ? Math.max(0, Math.min(100, Math.round(input.matchPercent)))
      : null;

  const application = await prisma.application.create({
    data: {
      userId,
      company,
      title,
      location: optionalText(input.location, 200),
      url: optionalText(input.url, 2000),
      source: optionalText(input.source, 80),
      matchPercent,
      resumeId,
      jobDescId,
      status,
      notes: optionalText(input.notes),
      appliedAt: status === "saved" ? null : new Date(),
      events: { create: { status } },
    },
  });
  return toDto(application);
}

/** Fetch an application that belongs to this user, or 404. */
async function requireApplication(userId: string, id: string) {
  const application = await prisma.application.findFirst({ where: { id, userId } });
  if (!application) throw notFound("Application not found.");
  return application;
}

export async function updateApplication(
  userId: string,
  id: string,
  input: { status?: unknown; notes?: unknown }
): Promise<ApplicationDto> {
  const existing = await requireApplication(userId, id);

  const data: Record<string, unknown> = {};
  let newStatus: ApplicationStatus | null = null;

  if (input.status !== undefined) {
    newStatus = validateStatus(input.status);
    data.status = newStatus;
    // Stamp the first move out of "saved" as the application date.
    if (newStatus !== "saved" && !existing.appliedAt) data.appliedAt = new Date();
  }
  if (input.notes !== undefined) data.notes = optionalText(input.notes);

  if (Object.keys(data).length === 0) return toDto(existing);

  const updated = await prisma.application.update({ where: { id }, data });

  // Record the transition — this is the outcome history.
  if (newStatus && newStatus !== existing.status) {
    await prisma.applicationEvent.create({ data: { applicationId: id, status: newStatus } });
  }
  return toDto(updated);
}

export async function deleteApplication(userId: string, id: string): Promise<{ id: string }> {
  await requireApplication(userId, id);
  await prisma.application.delete({ where: { id } });
  return { id };
}

export type ApplicationStats = {
  total: number;
  byStatus: Record<ApplicationStatus, number>;
  /** Share of submitted applications that reached interviewing or better. */
  interviewRate: number | null;
};

/**
 * Pipeline summary for the dashboard. `interviewRate` is computed only over
 * applications actually SUBMITTED (i.e. excluding "saved"), because counting
 * saved-but-never-sent jobs would understate it and mislead the user.
 */
export async function applicationStats(userId: string): Promise<ApplicationStats> {
  const grouped = await prisma.application.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });

  const byStatus = Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, 0])
  ) as Record<ApplicationStatus, number>;
  for (const row of grouped) {
    if (row.status in byStatus) byStatus[row.status as ApplicationStatus] = row._count._all;
  }

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const submitted = total - byStatus.saved;
  const reachedInterview = byStatus.interviewing + byStatus.offer;

  return {
    total,
    byStatus,
    interviewRate: submitted > 0 ? Math.round((reachedInterview / submitted) * 100) : null,
  };
}

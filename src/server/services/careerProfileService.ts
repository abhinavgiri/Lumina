/**
 * Career Profile Service — the person-level spine.
 *
 * Scope decision worth stating: experience, projects and certifications are NOT
 * mirrored here. They live in Resume.structuredJson, and duplicating them would
 * mean keeping two representations in sync forever — the same forked-data
 * problem that cost us a 104-vs-77 skill dictionary drift. This service holds
 * only what genuinely belongs to the PERSON rather than to one document:
 * targets, skills over time, learning commitments and interview outcomes.
 */
import { prisma } from "@/lib/db";
import { findSkills } from "@/lib/ai/localEngine";
import { badRequest, notFound } from "@/lib/api/response";
import { readStructured } from "@/server/services/resumeService";

export const LEARNING_STATUSES = ["planned", "learning", "done"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];

export const INTERVIEW_OUTCOMES = ["scheduled", "passed", "failed", "cancelled"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const INTERVIEW_KINDS = [
  "screen", "technical", "system-design", "behavioural", "onsite", "final",
] as const;

export type ProfileSkillDto = {
  name: string;
  source: string;
  proficiency: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type LearningItemDto = {
  id: string;
  skill: string;
  status: LearningStatus;
  source: string;
  notes: string | null;
  targetDate: string | null;
  completedAt: string | null;
};

export type CareerProfileDto = {
  targetRoles: string[];
  seniority: string | null;
  preferredLocation: string | null;
  openToRemote: boolean;
  skills: ProfileSkillDto[];
  learning: LearningItemDto[];
  /** Skills first seen within the last 90 days — visible skill growth. */
  recentlyAdded: string[];
};

const RECENT_DAYS = 90;

/** Get (or lazily create) the profile row for a user. */
export async function requireProfile(userId: string) {
  const existing = await prisma.careerProfile.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.careerProfile.create({ data: { userId } });
}

function parseRoles(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Refresh the skill list from the user's resumes.
 *
 * `firstSeenAt` is never overwritten — that's what makes growth measurable —
 * while `lastSeenAt` moves forward, so a skill dropped from a newer resume is
 * still visible as something they once had rather than silently vanishing.
 */
export async function syncSkillsFromResumes(userId: string): Promise<number> {
  const profile = await requireProfile(userId);

  // Skip entirely when no resume has been added since the last sync. This ran
  // on EVERY profile read, re-reading every resume's full text and re-upserting
  // every skill — it dominated the endpoint's cost and almost never had
  // anything new to do.
  const newest = await prisma.resume.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!newest) return 0;
  if (profile.skillsSyncedAt && newest.createdAt <= profile.skillsSyncedAt) return 0;

  const resumes = await prisma.resume.findMany({
    where: { userId },
    select: { rawText: true, structuredJson: true },
  });

  const found = new Set<string>();
  for (const r of resumes) {
    // Prefer the curated skills list; fall back to what the text demonstrates.
    const structured = readStructured(r.structuredJson);
    const source = structured?.skills.length ? structured.skills.join(", ") : r.rawText;
    for (const s of findSkills(source)) found.add(s.name);
  }
  if (found.size === 0) return 0;

  const now = new Date();
  await prisma.$transaction([
    ...[...found].map((name) =>
      prisma.profileSkill.upsert({
        where: { profileId_name: { profileId: profile.id, name } },
        create: { profileId: profile.id, name, source: "resume" },
        update: { lastSeenAt: now },
      })
    ),
    prisma.careerProfile.update({ where: { id: profile.id }, data: { skillsSyncedAt: now } }),
  ]);
  return found.size;
}

export async function getCareerProfile(userId: string): Promise<CareerProfileDto> {
  const profile = await requireProfile(userId);
  const [skills, learning] = await Promise.all([
    prisma.profileSkill.findMany({ where: { profileId: profile.id }, orderBy: { name: "asc" } }),
    prisma.learningItem.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);

  return {
    targetRoles: parseRoles(profile.targetRolesJson),
    seniority: profile.seniority,
    preferredLocation: profile.preferredLocation,
    openToRemote: profile.openToRemote,
    skills: skills.map((s) => ({
      name: s.name,
      source: s.source,
      proficiency: s.proficiency,
      firstSeenAt: s.firstSeenAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
    learning: learning.map((l) => ({
      id: l.id,
      skill: l.skill,
      status: l.status as LearningStatus,
      source: l.source,
      notes: l.notes,
      targetDate: l.targetDate?.toISOString() ?? null,
      completedAt: l.completedAt?.toISOString() ?? null,
    })),
    recentlyAdded: skills.filter((s) => s.firstSeenAt >= cutoff).map((s) => s.name),
  };
}

export async function updateCareerProfile(
  userId: string,
  input: {
    targetRoles?: unknown;
    seniority?: unknown;
    preferredLocation?: unknown;
    openToRemote?: unknown;
  }
): Promise<CareerProfileDto> {
  const profile = await requireProfile(userId);
  const data: Record<string, unknown> = {};

  if (input.targetRoles !== undefined) {
    if (!Array.isArray(input.targetRoles)) throw badRequest("targetRoles must be an array.");
    const roles = input.targetRoles.map((r) => String(r).trim()).filter(Boolean).slice(0, 10);
    data.targetRolesJson = JSON.stringify(roles);
  }
  if (input.seniority !== undefined) {
    data.seniority = input.seniority ? String(input.seniority).slice(0, 40) : null;
  }
  if (input.preferredLocation !== undefined) {
    data.preferredLocation = input.preferredLocation
      ? String(input.preferredLocation).slice(0, 120)
      : null;
  }
  if (input.openToRemote !== undefined) data.openToRemote = Boolean(input.openToRemote);

  if (Object.keys(data).length) {
    await prisma.careerProfile.update({ where: { id: profile.id }, data });
  }
  return getCareerProfile(userId);
}

// --- learning ---------------------------------------------------------------

function validateLearningStatus(raw: unknown): LearningStatus {
  const s = String(raw ?? "");
  if (!(LEARNING_STATUSES as readonly string[]).includes(s)) {
    throw badRequest(`Status must be one of: ${LEARNING_STATUSES.join(", ")}.`);
  }
  return s as LearningStatus;
}

/**
 * Commit to learning a skill. Called from the roadmap ("I'll do this one"), so
 * a generated suggestion becomes something the app can hold you to.
 */
export async function addLearningItem(
  userId: string,
  input: { skill?: unknown; source?: unknown; notes?: unknown }
): Promise<LearningItemDto> {
  const skill = String(input.skill ?? "").trim();
  if (!skill) throw badRequest("Skill is required.");

  const profile = await requireProfile(userId);
  const existing = await prisma.learningItem.findFirst({
    where: { profileId: profile.id, skill },
  });
  if (existing) throw badRequest(`${skill} is already on your learning list.`);

  const item = await prisma.learningItem.create({
    data: {
      profileId: profile.id,
      skill: skill.slice(0, 80),
      source: input.source === "roadmap" ? "roadmap" : "manual",
      notes: input.notes ? String(input.notes).slice(0, 500) : null,
    },
  });
  return {
    id: item.id,
    skill: item.skill,
    status: item.status as LearningStatus,
    source: item.source,
    notes: item.notes,
    targetDate: null,
    completedAt: null,
  };
}

export async function updateLearningItem(
  userId: string,
  id: string,
  input: { status?: unknown; notes?: unknown }
): Promise<LearningItemDto> {
  const profile = await requireProfile(userId);
  const item = await prisma.learningItem.findFirst({ where: { id, profileId: profile.id } });
  if (!item) throw notFound("Learning item not found.");

  const data: Record<string, unknown> = {};
  if (input.status !== undefined) {
    const status = validateLearningStatus(input.status);
    data.status = status;
    // Completing it stamps the date; re-opening clears it.
    data.completedAt = status === "done" ? new Date() : null;
  }
  if (input.notes !== undefined) {
    data.notes = input.notes ? String(input.notes).slice(0, 500) : null;
  }

  const updated = await prisma.learningItem.update({ where: { id }, data });
  return {
    id: updated.id,
    skill: updated.skill,
    status: updated.status as LearningStatus,
    source: updated.source,
    notes: updated.notes,
    targetDate: updated.targetDate?.toISOString() ?? null,
    completedAt: updated.completedAt?.toISOString() ?? null,
  };
}

export async function deleteLearningItem(userId: string, id: string): Promise<{ id: string }> {
  const profile = await requireProfile(userId);
  const item = await prisma.learningItem.findFirst({ where: { id, profileId: profile.id } });
  if (!item) throw notFound("Learning item not found.");
  await prisma.learningItem.delete({ where: { id } });
  return { id };
}

// --- interviews -------------------------------------------------------------

export type InterviewDto = {
  id: string;
  round: number;
  kind: string;
  outcome: InterviewOutcome;
  notes: string | null;
  scheduledAt: string | null;
};

/** Interview rounds for one of the user's applications, oldest round first. */
export async function listInterviews(userId: string, applicationId: string): Promise<InterviewDto[]> {
  const application = await prisma.application.findFirst({ where: { id: applicationId, userId } });
  if (!application) throw notFound("Application not found.");

  const rows = await prisma.interview.findMany({
    where: { applicationId },
    orderBy: { round: "asc" },
  });
  return rows.map((i) => ({
    id: i.id,
    round: i.round,
    kind: i.kind,
    outcome: i.outcome as InterviewOutcome,
    notes: i.notes,
    scheduledAt: i.scheduledAt?.toISOString() ?? null,
  }));
}

/**
 * Log an interview round. Recording one also moves the application to
 * "interviewing" if it hasn't already — otherwise the pipeline and the
 * interview log would disagree about the same fact.
 */
export async function addInterview(
  userId: string,
  applicationId: string,
  input: { kind?: unknown; outcome?: unknown; notes?: unknown; scheduledAt?: unknown }
): Promise<InterviewDto> {
  const application = await prisma.application.findFirst({ where: { id: applicationId, userId } });
  if (!application) throw notFound("Application not found.");

  const kind = (INTERVIEW_KINDS as readonly string[]).includes(String(input.kind))
    ? String(input.kind)
    : "screen";
  const outcome = (INTERVIEW_OUTCOMES as readonly string[]).includes(String(input.outcome))
    ? (String(input.outcome) as InterviewOutcome)
    : "scheduled";

  const previous = await prisma.interview.count({ where: { applicationId } });
  const scheduledAt = input.scheduledAt ? new Date(String(input.scheduledAt)) : null;

  const interview = await prisma.interview.create({
    data: {
      applicationId,
      round: previous + 1,
      kind,
      outcome,
      notes: input.notes ? String(input.notes).slice(0, 1000) : null,
      scheduledAt: scheduledAt && !Number.isNaN(scheduledAt.valueOf()) ? scheduledAt : null,
    },
  });

  if (application.status === "saved" || application.status === "applied") {
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: "interviewing", appliedAt: application.appliedAt ?? new Date() },
    });
    await prisma.applicationEvent.create({
      data: { applicationId, status: "interviewing", note: `Interview logged (${kind})` },
    });
  }

  return {
    id: interview.id,
    round: interview.round,
    kind: interview.kind,
    outcome: interview.outcome as InterviewOutcome,
    notes: interview.notes,
    scheduledAt: interview.scheduledAt?.toISOString() ?? null,
  };
}

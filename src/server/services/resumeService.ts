/**
 * Resume Service — create, structure, and polish resumes.
 *
 * Business logic lives here, not in route handlers. Routes become thin HTTP
 * adapters: read input, call a service, return `ok(...)`. That makes this logic
 * testable without spinning up Next, and reusable from more than one route.
 */
import { prisma } from "@/lib/db";
import { parseResumeFile } from "@/lib/parseResume";
import { sanitizeResumeText } from "@/lib/textSanitize";
import { polishStructuredResume, structureResumeFromText } from "@/lib/ai/polishResume";
import {
  structuredResumeSchema,
  structuredResumeToText,
  type StructuredResume,
} from "@/lib/resumeTypes";
import { badRequest, notFound, unprocessable } from "@/lib/api/response";

/** Minimum extracted characters before we call an upload usable. */
const MIN_EXTRACTED_CHARS = 20;
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

export type SavedResume = { resumeId: string; rawText: string };

/** Fetch a resume that belongs to this user, or throw a 404. */
export async function requireResume(userId: string, resumeId: string) {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId } });
  if (!resume) throw notFound("Resume not found.");
  return resume;
}

/** Parse the structuredJson blob if it's present and valid, else null. */
export function readStructured(structuredJson: string | null): StructuredResume | null {
  if (!structuredJson) return null;
  try {
    const parsed = structuredResumeSchema.safeParse(JSON.parse(structuredJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Upload path: extract text from a PDF/DOCX, sanitize it, and persist. */
export async function createResumeFromFile(userId: string, file: File): Promise<SavedResume> {
  const lower = file.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw badRequest("Only PDF and DOCX files are supported.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Sanitize at ingestion: PDF extraction leaves private-use glyphs, ligatures
  // and zero-width chars that corrupt parsing and PDF re-export downstream.
  const rawText = sanitizeResumeText(await parseResumeFile(buffer, file.name));

  if (!rawText || rawText.length < MIN_EXTRACTED_CHARS) {
    throw unprocessable(
      "Couldn't extract readable text from this file. It may be scanned/image-based."
    );
  }

  const resume = await prisma.resume.create({
    data: { userId, source: "uploaded", rawText, filePath: file.name },
  });
  return { resumeId: resume.id, rawText };
}

/** Builder/interview path: persist a structured resume and its text rendering. */
export async function createResumeFromStructured(
  userId: string,
  input: unknown
): Promise<SavedResume> {
  const parsed = structuredResumeSchema.safeParse(input);
  if (!parsed.success) {
    throw badRequest("Invalid resume data.", parsed.error.flatten());
  }

  const rawText = structuredResumeToText(parsed.data);
  const resume = await prisma.resume.create({
    data: {
      userId,
      source: "built",
      rawText,
      structuredJson: JSON.stringify(parsed.data),
    },
  });
  return { resumeId: resume.id, rawText };
}

export type PolishedResume = SavedResume & {
  resume: StructuredResume;
  engine: string;
};

/**
 * AI-polish a resume in place so the preview, analysis, downloads and tailoring
 * all use the improved version.
 *
 * Uploaded (no structuredJson): send the RAW TEXT to the LLM, which parses,
 * restructures and polishes in one step — far better than the heuristic parser
 * at splitting jumbled sections. Built/structured: run the strict polish that
 * preserves the existing structure.
 */
export async function polishResume(
  userId: string,
  resumeId: string,
  allowCloud = false
): Promise<PolishedResume> {
  const resume = await requireResume(userId, resumeId);
  const structured = readStructured(resume.structuredJson);

  const { resume: polished, engine } = structured
    ? await polishStructuredResume(structured, allowCloud)
    : await structureResumeFromText(resume.rawText, allowCloud);

  const rawText = structuredResumeToText(polished);
  await prisma.resume.update({
    where: { id: resume.id },
    data: { structuredJson: JSON.stringify(polished), rawText },
  });

  return { resumeId: resume.id, resume: polished, rawText, engine };
}

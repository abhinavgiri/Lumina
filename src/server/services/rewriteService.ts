/**
 * Targeted bullet rewriting — the LLM stage of the Phase 4 pipeline.
 *
 * The difference from a generic "improve this" call: the deterministic engine
 * has already diagnosed WHY each bullet is weak, and that diagnosis is passed
 * to the model as the specific job to do. Fixing a passive opener and adding
 * missing tool names are different tasks, and the model does better when told
 * which one it's on.
 *
 * The honest boundary: some weaknesses CANNOT be fixed by rewriting. If a bullet
 * has no measurable outcome, the number doesn't exist in the text and inventing
 * one would be fabricating evidence. So the model is told to sharpen the
 * mechanism instead, and we separately return a question for the USER to answer
 * ("how many pipelines?"). Only they know the real figure.
 *
 * Every result is checked by validateRewrite() before being offered, and any
 * failure falls back to the original bullet.
 */
import { llmJson } from "@/lib/ai/llmClient";
import { canonicalizeText } from "@/lib/ai/skillCasing";
import { analyzeResumeIntelligence, type BulletInsight } from "@/lib/resume/intelligence";
import { validateRewrite, type RewriteRejection } from "@/lib/resume/rewriteValidation";
import { structuredResumeSchema } from "@/lib/resumeTypes";
import { badRequest } from "@/lib/api/response";

const MAX_BULLETS = 12;

export type RewrittenBullet = {
  original: string;
  rewritten: string | null;
  /** Set when the rewrite was discarded, so the UI can be honest about why. */
  rejected: RewriteRejection | null;
  /** What only the user can supply — a real number we must not invent. */
  askUser: string | null;
  issues: string[];
};

export type RewriteResult = {
  bullets: RewrittenBullet[];
  engine: "groq" | "gemini" | "local";
  /** How many rewrites the validator threw out — surfaced, not hidden. */
  rejectedCount: number;
};

const SYSTEM = `You are a precise technical resume editor. You rewrite ONE resume bullet at a time, fixing ONLY the specific problems you are told about.

ABSOLUTE RULES — breaking any of these makes the output useless:
- NEVER invent numbers, percentages, durations, team sizes, or money. If the input has no metric, the output has no metric.
- NEVER add tools, technologies, employers or systems that are not already in the input.
- NEVER drop a number, named system, or technology that IS in the input.
- Do not use: results-driven, proven ability, detail-oriented, team player, seamless, leverage, utilize, synergy, passionate about, responsible for, worked on, various, spearheaded.

HOW TO FIX EACH PROBLEM:
- "passive opener" / "no action verb": start with a strong past-tense verb (Built, Designed, Automated, Reduced, Led, Migrated).
- "no specifics": name the tools/systems ALREADY mentioned or clearly implied by the input. Never add new ones.
- "no measurable outcome": do NOT invent a number. Instead make the MECHANISM concrete — what specifically changed as a result. Then set "ask" to a short question whose answer would supply the real metric.
- "too long": tighten wording, keep every fact.
- "too short": expand only with detail already present in the input.

Return strict JSON: {"rewritten": string, "ask": string|null}`;

function instructionFor(insight: BulletInsight): string {
  const problems: string[] = [];
  if (!insight.hasActionVerb) problems.push("passive opener / no action verb");
  if (!insight.hasSpecifics) problems.push("no specifics (names no tools or systems)");
  if (!insight.hasMetric) problems.push("no measurable outcome");
  if (insight.wordCount > 34) problems.push("too long");
  if (insight.wordCount < 8) problems.push("too short");
  return problems.length ? problems.join("; ") : "tighten the wording without changing any facts";
}

async function rewriteOne(insight: BulletInsight, allowCloud: boolean): Promise<RewrittenBullet> {
  const base: RewrittenBullet = {
    original: insight.text,
    rewritten: null,
    rejected: null,
    askUser: null,
    issues: insight.issues,
  };

  const llm = await llmJson<{ rewritten?: string; ask?: string | null }>({
    system: SYSTEM,
    user: `PROBLEMS TO FIX: ${instructionFor(insight)}\n\nBULLET:\n${insight.text}`,
    maxTokens: 400,
    temperature: 0.35,
  });

  if (!llm?.data?.rewritten || typeof llm.data.rewritten !== "string") {
    return base; // no key configured, or the call failed — keep the original
  }

  // Never trust the model for acronym casing.
  const candidate = canonicalizeText(llm.data.rewritten.trim().replace(/\.$/, ""));
  const check = validateRewrite(insight.text, candidate);

  return {
    ...base,
    rewritten: check.ok ? candidate : null,
    rejected: check.ok ? null : check.reason,
    askUser: typeof llm.data.ask === "string" && llm.data.ask.trim() ? llm.data.ask.trim() : null,
  };
}

/**
 * Rewrite the bullets of a structured resume that the deterministic engine
 * flagged as improvable. Strong bullets are left alone — there is nothing to
 * gain from rewriting something that already works.
 */
export async function rewriteResumeBullets(
  input: unknown,
  allowCloud = false
): Promise<RewriteResult> {
  const parsed = structuredResumeSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Body must be a structured resume.");

  const targets = analyzeResumeIntelligence(parsed.data)
    .bullets.filter((b) => b.grade !== "strong")
    .slice(0, MAX_BULLETS);

  if (targets.length === 0) {
    return { bullets: [], engine: "local", rejectedCount: 0 };
  }

  // Sequential on purpose: free-tier providers rate-limit aggressively, and a
  // burst of parallel calls gets the whole batch throttled.
  const bullets: RewrittenBullet[] = [];
  for (const t of targets) bullets.push(await rewriteOne(t, allowCloud));

  const anyRewritten = bullets.some((b) => b.rewritten !== null);
  return {
    bullets,
    engine: anyRewritten ? "groq" : "local",
    rejectedCount: bullets.filter((b) => b.rejected !== null).length,
  };
}

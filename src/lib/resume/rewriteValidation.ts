/**
 * Validation stage of the Phase 4 pipeline — the guard between an LLM rewrite
 * and the user's resume.
 *
 * A resume is a factual claim someone makes to an employer. A model that
 * invents "reduced costs by 30%" to make a bullet sound stronger has fabricated
 * evidence on their behalf, and they may not notice before an interview. So
 * every rewrite is checked mechanically before it is ever offered:
 *
 *   - no NEW numbers that weren't in the original
 *   - no numbers silently dropped
 *   - no tools/technologies the original didn't mention
 *   - no banned filler, no wild length changes
 *
 * A rewrite that fails any check is discarded and the original is kept. This is
 * deliberately conservative: a missed improvement costs nothing, a fabricated
 * metric can cost someone a job.
 */
import { findSkills } from "@/lib/ai/localEngine";

export type RewriteRejection =
  | "invented-number"
  | "dropped-number"
  | "invented-tool"
  | "banned-phrase"
  | "too-long"
  | "too-short"
  | "empty"
  | "unchanged";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: RewriteRejection; detail: string };

/** Filler that makes a resume read as generic AI output. */
const BANNED = [
  "results-driven", "proven ability", "proven track record", "detail-oriented",
  "team player", "seamless", "leverage", "utilize", "utilized", "synergy",
  "dynamic professional", "passionate about", "responsible for", "worked on",
  "helped to", "various", "spearheaded",
];

/**
 * Numbers as a comparable set. Trailing "+" / "%" / "k" are dropped and commas
 * removed, so "1,000,000" and "1000000" match, and "500+" matches "500".
 */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,._]*/g) ?? [])
    .map((n) => n.replace(/[,_]/g, "").replace(/\.$/, ""))
    .filter(Boolean);
}

/** Numbers that are part of a named entity ("S3", "Log4j") aren't metrics. */
function metricNumbers(text: string): string[] {
  return numbersIn(text.replace(/\b[a-z]+\d+\b/gi, " "));
}

export function validateRewrite(original: string, rewrite: string): ValidationResult {
  const clean = rewrite.trim();

  if (!clean) return { ok: false, reason: "empty", detail: "Rewrite was empty." };
  if (clean.toLowerCase() === original.trim().toLowerCase()) {
    return { ok: false, reason: "unchanged", detail: "Rewrite is identical to the original." };
  }

  // 1. No invented metrics. This is the one that actually matters.
  const before = new Set(metricNumbers(original));
  const after = metricNumbers(clean);
  const invented = after.filter((n) => !before.has(n));
  if (invented.length) {
    return {
      ok: false,
      reason: "invented-number",
      detail: `Introduced ${invented.join(", ")}, which is not in the original.`,
    };
  }

  // 2. Real achievements must survive the rewrite.
  const afterSet = new Set(after);
  const dropped = [...before].filter((n) => !afterSet.has(n));
  if (dropped.length) {
    return {
      ok: false,
      reason: "dropped-number",
      detail: `Dropped ${dropped.join(", ")} from the original.`,
    };
  }

  // 3. No tools the person never claimed to have used.
  const toolsBefore = new Set(findSkills(original).map((s) => s.name));
  const newTools = findSkills(clean)
    .map((s) => s.name)
    .filter((s) => !toolsBefore.has(s));
  if (newTools.length) {
    return {
      ok: false,
      reason: "invented-tool",
      detail: `Added ${newTools.join(", ")}, which the original didn't mention.`,
    };
  }

  const lower = clean.toLowerCase();
  const banned = BANNED.filter((p) => lower.includes(p));
  if (banned.length) {
    return { ok: false, reason: "banned-phrase", detail: `Used filler: ${banned.join(", ")}.` };
  }

  const words = clean.split(/\s+/).length;
  if (words > 40) return { ok: false, reason: "too-long", detail: `${words} words is too long.` };
  if (words < 5) return { ok: false, reason: "too-short", detail: `${words} words is too short.` };

  return { ok: true };
}

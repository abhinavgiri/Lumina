/**
 * AI Service — LLM-backed language generation with a guaranteed local fallback.
 *
 * Tier 2 of the AI ladder (see lib/ai/llmClient.ts). Every function here MUST
 * degrade to the deterministic rule-based path when no key is configured or the
 * provider fails, so the interview and builder always work offline.
 *
 * LLMs are used for LANGUAGE ONLY — never for scoring or business decisions.
 */
import { llmJson } from "@/lib/ai/llmClient";
import { enhanceBullet, enhanceSummary } from "@/lib/interview/enhance";
import { canonicalizeText } from "@/lib/ai/skillCasing";
import { badRequest } from "@/lib/api/response";

/** Phrases that make a resume read as generic AI boilerplate. */
const BANNED = [
  "results-driven", "proven ability", "proven track record", "enhance productivity",
  "detail-oriented", "team player", "seamless", "leverage", "utilize", "utilized",
  "spearheaded", "synergy", "dynamic professional", "passionate about",
  "responsible for", "worked on", "helped to", "various",
];

const MAX_LINES = 12;
const MAX_LINE_CHARS = 600;

export type EnhanceKind = "bullets" | "summary";
export type EnhanceResult = { improved: string[]; engine: string };

function bulletsPrompt(count: number, banned: string): string {
  return `You are a top-tier technical resume writer for FAANG-level candidates. Rewrite each line into ONE sharp, specific resume bullet.

STRUCTURE: [strong past-tense verb] + [specific WHAT, naming the actual tools/systems/scope from the input] + [concrete OUTCOME].

RULES:
- Be SPECIFIC and technical. Name the real tools, systems, data, and scope that appear in the input. Vague bullets are failures.
- PRESERVE every concrete detail from the input — all numbers, named systems, architectures, metrics. Never drop or compress them; lengthen the bullet to keep them.
- Fix grammar/spelling. Keep acronyms uppercase: BI, ETL, SQL, DAX, KPI, AI, ML, NLP, API, ODI.
- Do NOT invent numbers, employers, tools, or metrics that aren't there. When no metric exists, be concrete about the MECHANISM and qualitative impact — never fall back to filler.
- BANNED words/phrases (never use): ${banned}. Also avoid "enhance/improve X and Y" empty pairs.
- One sentence each, up to ~28 words, no trailing period.

Example: "build a automation on python to reduce manual time" -> "Built a Python automation that eliminated recurring manual data compilation, cutting routine reporting turnaround"
Return strict JSON: {"improved": string[]} with EXACTLY ${count} item(s), same order.`;
}

function summaryPrompt(targetRole: string | undefined, banned: string): string {
  return `You are a top-tier technical resume writer. Write a punchy professional summary of 2-3 sentences${
    targetRole ? ` for a ${targetRole}` : ""
  }.

RULES:
- Lead with the candidate's actual specialization and the concrete tools/domains from the input (e.g. "Data engineer specializing in Oracle ODI and Power BI…").
- Third-person implied (no "I"). Specific, confident, concrete. Keep acronyms uppercase.
- Use only facts in the input. Never invent experience or numbers. If given a long pasted resume, distill the strongest 2-3 sentences.
- BANNED (never use): ${banned}. No empty openers like "Results-driven professional with experience in…".
Return strict JSON: {"improved": string[]} with exactly 1 item.`;
}

/**
 * Rewrite weak interview answers into strong resume language.
 * LLM-backed when a key is configured; falls back to the local rule-based
 * enhancer otherwise, so the interview always works.
 */
export async function enhanceLines(
  kind: unknown,
  lines: unknown,
  targetRole?: string,
  allowCloud = false
): Promise<EnhanceResult> {
  if (
    (kind !== "bullets" && kind !== "summary") ||
    !Array.isArray(lines) ||
    lines.length === 0 ||
    lines.length > MAX_LINES
  ) {
    throw badRequest(`Expected { kind: 'bullets'|'summary', lines: string[1..${MAX_LINES}] }`);
  }

  const clean = lines.map((l) => String(l).slice(0, MAX_LINE_CHARS));
  const banned = BANNED.join(", ");
  const system =
    kind === "bullets" ? bulletsPrompt(clean.length, banned) : summaryPrompt(targetRole, banned);

  const llm = await llmJson<{ improved: string[] }>({
    system,
    user: clean.map((l, i) => `${i + 1}. ${l}`).join("\n"),
    maxTokens: 900,
    temperature: 0.5,
    allowCloud,
  });

  if (llm && Array.isArray(llm.data.improved) && llm.data.improved.length >= 1) {
    const improved = clean.map((orig, i) => {
      const v = llm.data.improved[i];
      // Never trust the model for casing — canonicalize deterministically.
      return typeof v === "string" && v.trim()
        ? canonicalizeText(v.trim().replace(/\.$/, ""))
        : orig;
    });
    return { improved, engine: llm.provider };
  }

  // Local fallback — rule-based, never fails.
  const improved =
    kind === "bullets"
      ? clean.map((l) => enhanceBullet(l) ?? l)
      : [enhanceSummary(clean.join(" "), targetRole) ?? clean.join(" ")];
  return { improved, engine: "local" };
}

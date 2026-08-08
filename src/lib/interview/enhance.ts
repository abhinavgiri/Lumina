/**
 * Answer enhancement: rewrites weak, casual phrasing into strong, ATS-style
 * resume language. Deterministic and local (same privacy stance as the rest
 * of the AI layer) — designed so an LLM engine can replace it behind the same
 * function signature later.
 */
import { SKILLS } from "@/lib/ai/skillsData";

// Covers past AND present tense — people type "build a automation", not
// just "built". The leading article cleanup ("a automation") happens below.
const WEAK_VERB_MAP: Array<[RegExp, string]> = [
  [/^(i\s+)?(built|build(ing)?|created?|making|made|make)\b/i, "Designed and developed"],
  [/^(i\s+)?(developed|develop(ing)?)\b/i, "Developed"],
  [/^(i\s+)?((was\s+)?work(ed|ing)?\s+on)\b/i, "Contributed to"],
  [/^(i\s+)?(did|do(ing)?|handled?|handling|managed?|managing)\b/i, "Managed"],
  [/^(i\s+)?(helped|help(ing)?|assist(ed|ing)?)( with| in| to)?\b/i, "Supported"],
  [/^(i\s+)?(fixed|fix(ing)?|solved?|solving)\b/i, "Resolved"],
  [/^(i\s+)?(used|use|using)\b/i, "Leveraged"],
  [/^(i\s+)?(improved?|improving|made better)\b/i, "Optimized"],
  [/^(i\s+)?(wrote|writ(e|ing)|coded?|coding)\b/i, "Engineered"],
  [/^(i\s+)?(tested?|testing)\b/i, "Validated"],
  [/^(i\s+)?(automated?|automating)\b/i, "Automated"],
  [/^(i\s+)?(led|lead(ing)?)\b/i, "Led"],
  [/^(i\s+)?(analyzed?|analysed?|analyzing|analysing)\b/i, "Analyzed"],
  [/^(i\s+)?(maintained?|maintaining)\b/i, "Maintained and enhanced"],
  [/^(i\s+)?(trained?|training)\b/i, "Trained and mentored"],
];

const IMPACT_HINTS: Record<string, string> = {
  dashboard: "improving reporting efficiency and enabling data-driven decision-making",
  report: "improving visibility for business stakeholders",
  pipeline: "improving data reliability and reducing manual effort",
  etl: "improving data reliability and processing efficiency",
  api: "improving system integration and response times",
  automat: "significantly reducing manual effort and turnaround time",
  test: "improving release quality and confidence",
  migrat: "ensuring a smooth transition with zero data loss",
  model: "improving prediction quality and business outcomes",
  optimiz: "reducing processing time and infrastructure cost",
  deploy: "improving release velocity and stability",
  design: "improving usability and adoption",
};

const hasMetric = (s: string) => /\d+\s*(%|\+|x\b|percent|users|rows|records|hours|days|team|clients|crore|lakh|k\b|m\b)/i.test(s) || /\d{2,}/.test(s);
const hasImpactClause = (s: string) => /(improv|reduc|increas|enabl|sav|acceler|boost|cut|grew|deliver|drove|decreas)/i.test(s);

/** Detect known technologies mentioned in free text (uses the shared skill dictionary). */
export function detectTech(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const def of SKILLS) {
    const names = [def.name.toLowerCase(), ...(def.aliases ?? [])];
    if (names.some((n) => lower.includes(` ${n.toLowerCase()} `) || lower.includes(`${n.toLowerCase()},`) || lower.includes(`${n.toLowerCase()}.`))) {
      found.push(def.name);
    }
  }
  return [...new Set(found)];
}

/**
 * Rewrite one achievement line into a stronger resume bullet.
 * Returns null when the input is already strong (no rewrite worth showing).
 */
export function enhanceBullet(input: string): string | null {
  let s = input.trim().replace(/^[-•*]\s*/, "").replace(/\.+$/, "");
  if (!s) return null;
  const original = s;

  // Strong verb upgrade
  let upgraded = false;
  for (const [re, verb] of WEAK_VERB_MAP) {
    if (re.test(s)) {
      s = s.replace(re, verb);
      upgraded = true;
      break;
    }
  }
  // Drop a leading first-person that survived + tidy common article slips
  s = s.replace(/^i\s+/i, "");
  s = s.replace(/\ba automation\b/gi, "an automation").replace(/\bon python\b/gi, "in Python");
  s = s.charAt(0).toUpperCase() + s.slice(1);

  // Enrich with detected tech context when the sentence is thin
  const words = s.split(/\s+/).length;
  const tech = detectTech(s);
  let enriched = s;

  if (words < 9 && tech.length > 0 && !/with|using|leveraging/i.test(s)) {
    // Only enrichments that add NEW substance — never restate a tech the
    // sentence already names ("ETL pipelines using ETL").
    const first = tech[0];
    if (/power bi/i.test(first)) enriched = `${s} with advanced DAX measures and interactive data models`;
    else if (/spark|databricks/i.test(first)) enriched = `${s} on large-scale distributed datasets`;
    else if (/^sql$/i.test(first)) enriched = `${s} with optimized, production-grade queries`;
  }

  // Append an impact clause when there's neither a metric nor an outcome
  if (!hasMetric(enriched) && !hasImpactClause(enriched)) {
    const lower = enriched.toLowerCase();
    const hint = Object.entries(IMPACT_HINTS).find(([k]) => lower.includes(k));
    enriched = `${enriched}, ${hint ? hint[1] : "delivering measurable improvements for the team"}`;
  }

  const changed = upgraded || enriched !== s || enriched.toLowerCase() !== original.toLowerCase();
  return changed && enriched.toLowerCase() !== original.toLowerCase() ? enriched : null;
}

/** Polish a professional summary: person, tense, filler removal. */
export function enhanceSummary(input: string, targetRole?: string): string | null {
  let s = input.trim().replace(/\s+/g, " ");
  if (!s) return null;
  const original = s;
  s = s.replace(/^(hi|hello|hey)[,!.\s]+/i, "");
  s = s.replace(/\b(i am|i'm)\b/gi, "").replace(/\bmy name is [a-z ]+?[,.]\s*/i, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^[a-z]/, (c) => c.toUpperCase());
  if (targetRole && !s.toLowerCase().includes(targetRole.toLowerCase())) {
    s = `${targetRole} — ${s}`;
  }
  if (!/\.$/.test(s)) s += ".";
  return s.toLowerCase() === original.toLowerCase() ? null : s;
}

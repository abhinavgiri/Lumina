/**
 * Resume Intelligence — the deterministic analysis stage of the Phase 4
 * pipeline (parse → normalize → intelligence → LLM rewrite → validate → PDF).
 *
 * DELIBERATELY NOT AN LLM. Per the project's development rules, language models
 * generate *wording*; they do not make judgements. Everything here — grading a
 * bullet, spotting inconsistency, deciding section order — is rule-based, so it
 * is explainable to the user ("this bullet has no measurable outcome"),
 * reproducible, free to run, and works offline.
 *
 * It also never invents. `keywordOpportunities` only surfaces skills the user
 * has already demonstrated in their own text; it never suggests adding a skill
 * they haven't shown.
 */
import { findSkills } from "@/lib/ai/localEngine";
import { ACTION_VERBS, WEAK_BULLET_OPENERS } from "@/lib/ai/writingRules";
import type { StructuredResume } from "@/lib/resumeTypes";

export type BulletGrade = "strong" | "adequate" | "weak";

export type BulletInsight = {
  text: string;
  /** Where it came from, so the UI can point at the right role. */
  role: string;
  grade: BulletGrade;
  hasActionVerb: boolean;
  hasMetric: boolean;
  /** Names at least one real tool/system/technology. */
  hasSpecifics: boolean;
  wordCount: number;
  /** Plain-language description of what's missing. */
  issues: string[];
};

export type ConsistencyIssue = { type: string; detail: string; fix: string };

export type KeywordOpportunity = {
  skill: string;
  /** The user's own sentence proving they've used it. */
  evidence: string;
};

export type SectionRecommendation = { order: string[]; reason: string };

export type ResumeIntelligence = {
  bullets: BulletInsight[];
  counts: Record<BulletGrade, number>;
  consistency: ConsistencyIssue[];
  keywordOpportunities: KeywordOpportunity[];
  sections: SectionRecommendation;
  /** One-sentence verdict for the top of the panel. */
  headline: string;
};

const VERB_SET = new Set(ACTION_VERBS.map((v) => v.toLowerCase()));

/** Numbers, percentages, currency, or magnitude words — evidence of scale. */
const METRIC_RE = /(\d[\d,.]*\s*(%|k\b|m\b|bn\b|x\b)?|\$\s?\d|\b\d+\+)/i;
/** Scale described without a digit — both past and "-ing" forms. */
const SCALE_WORDS = /\b(doubl|tripl|halv|eliminat)(ed|ing)\b|\bzero\b/i;

const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";

/**
 * Skills named in a piece of text. Delegates to the canonical word-boundary
 * matcher — a naive `includes()` here matched the skill "R" inside any word
 * containing an "r".
 */
const skillsIn = (text: string): string[] => findSkills(text).map((s) => s.name);

function gradeBullet(text: string, role: string): BulletInsight {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const hasActionVerb = VERB_SET.has(firstWord(text));
  const isWeakOpener = WEAK_BULLET_OPENERS.some((w) => text.toLowerCase().startsWith(w));
  const hasMetric = METRIC_RE.test(text) || SCALE_WORDS.test(text);
  const specifics = skillsIn(text);
  const hasSpecifics = specifics.length > 0;

  const issues: string[] = [];
  if (isWeakOpener) {
    issues.push('Starts passively — lead with a verb ("Responsible for managing X" → "Managed X").');
  } else if (!hasActionVerb) {
    issues.push("Doesn't open with a strong action verb.");
  }
  if (!hasMetric) {
    issues.push("No measurable outcome — add scale, time saved, or % improvement if you have it.");
  }
  if (!hasSpecifics) {
    issues.push("Doesn't name the tools or systems you used, so it reads generically.");
  }
  if (words.length < 8) {
    issues.push("Very short — there's likely more substance to show here.");
  } else if (words.length > 34) {
    issues.push("Long enough to lose a skim-reader; consider splitting it.");
  }

  // A bullet is only "strong" when it does all three jobs: leads with action,
  // names something real, and proves an outcome.
  const grade: BulletGrade =
    hasActionVerb && hasSpecifics && hasMetric && !isWeakOpener
      ? "strong"
      : (hasActionVerb || hasSpecifics) && !isWeakOpener
        ? "adequate"
        : "weak";

  return { text, role, grade, hasActionVerb, hasMetric, hasSpecifics, wordCount: words.length, issues };
}

/**
 * Past-tense vs "-ing" openers mixed within one resume.
 *
 * A regex for "-ed" alone is not enough: most strong resume verbs are irregular
 * ("Built", "Led", "Ran"), so ACTION_VERBS — which are already past tense — is
 * the reliable signal.
 */
function tenseIssues(bullets: { text: string }[]): ConsistencyIssue[] {
  const past = bullets.filter(
    (b) => /^[a-z]+ed\b/i.test(b.text) || VERB_SET.has(firstWord(b.text))
  ).length;
  const present = bullets.filter((b) => /^[a-z]+ing\b/i.test(b.text)).length;
  if (past > 0 && present > 0) {
    return [
      {
        type: "Verb tense",
        detail: `${past} bullet(s) use past tense while ${present} use "-ing" forms.`,
        fix: "Use past tense for previous roles and keep one consistent style within each role.",
      },
    ];
  }
  return [];
}

function consistencyChecks(resume: StructuredResume, allBullets: string[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  issues.push(...tenseIssues(allBullets.map((text) => ({ text }))));

  // Trailing punctuation should be all-or-nothing.
  if (allBullets.length >= 4) {
    const withPeriod = allBullets.filter((b) => /\.\s*$/.test(b)).length;
    if (withPeriod > 0 && withPeriod < allBullets.length) {
      issues.push({
        type: "Punctuation",
        detail: `${withPeriod} of ${allBullets.length} bullets end with a period; the rest don't.`,
        fix: "Pick one convention and apply it to every bullet.",
      });
    }
  }

  // Date formats across roles ("Jan 2021" vs "2021" vs "01/2021").
  const formats = new Set(
    resume.experience
      .flatMap((e) => [e.startDate, e.endDate])
      .filter(Boolean)
      .map((d) =>
        /^[a-z]{3,}\s+\d{4}$/i.test(d) ? "Mon YYYY" : /^\d{4}$/.test(d) ? "YYYY" : "other"
      )
  );
  if (formats.size > 1) {
    issues.push({
      type: "Date format",
      detail: `Employment dates are written ${formats.size} different ways.`,
      fix: 'Use one format everywhere — "Mon YYYY – Mon YYYY" parses most reliably.',
    });
  }

  // A role with no bullets is invisible to a reader and to an ATS.
  const empty = resume.experience.filter((e) => e.bullets.length === 0);
  if (empty.length) {
    issues.push({
      type: "Empty role",
      detail: `${empty.length} role(s) have no bullet points (${empty.map((e) => e.title).join(", ")}).`,
      fix: "Add at least two bullets, or remove the role if it isn't relevant.",
    });
  }

  return issues;
}

/**
 * Skills the user has demonstrably used — they appear in their own experience
 * or project text — but which are missing from the skills list an ATS reads.
 *
 * This is truthful enrichment: it surfaces what they already proved, never
 * suggesting a skill they haven't shown.
 */
function keywordOpportunities(resume: StructuredResume): KeywordOpportunity[] {
  const listed = new Set(resume.skills.map((s) => s.toLowerCase().trim()));

  const sources: { text: string }[] = [
    ...resume.experience.flatMap((e) => e.bullets.map((text) => ({ text }))),
    ...resume.projects.flatMap((p) => [
      { text: p.description },
      ...p.bullets.map((text) => ({ text })),
    ]),
  ].filter((s) => s.text?.trim());

  const found = new Map<string, string>();
  for (const { text } of sources) {
    for (const skill of skillsIn(text)) {
      if (!listed.has(skill.toLowerCase()) && !found.has(skill)) {
        found.set(skill, text.trim());
      }
    }
  }

  return [...found.entries()]
    .map(([skill, evidence]) => ({
      skill,
      evidence: evidence.length > 120 ? `${evidence.slice(0, 117)}…` : evidence,
    }))
    .slice(0, 8);
}

/**
 * Section order. Conservative on purpose: experience-first is the convention and
 * we only recommend moving projects up when they genuinely carry more evidence
 * than the work history — the real case for students and career changers.
 */
function recommendSections(resume: StructuredResume): SectionRecommendation {
  const expBullets = resume.experience.reduce((n, e) => n + e.bullets.length, 0);
  const projBullets = resume.projects.reduce((n, p) => n + p.bullets.length, 0);
  const base = ["Summary", "Skills"];

  if (resume.experience.length === 0 && resume.projects.length > 0) {
    return {
      order: [...base, "Projects", "Education", "Experience"],
      reason: "No work experience listed, so projects carry the evidence and should come first.",
    };
  }
  if (projBullets > expBullets && projBullets >= 4) {
    return {
      order: [...base, "Projects", "Experience", "Education"],
      reason:
        "Your projects show more detail than your work history — leading with them puts your strongest evidence first.",
    };
  }
  return {
    order: [...base, "Experience", "Projects", "Education"],
    reason: "Standard order — your work experience is the strongest evidence you have.",
  };
}

export function analyzeResumeIntelligence(resume: StructuredResume): ResumeIntelligence {
  const bullets: BulletInsight[] = resume.experience.flatMap((exp) =>
    exp.bullets
      .filter((b) => b.trim())
      .map((b) => gradeBullet(b, [exp.title, exp.company].filter(Boolean).join(" · ")))
  );

  const counts: Record<BulletGrade, number> = { strong: 0, adequate: 0, weak: 0 };
  for (const b of bullets) counts[b.grade]++;

  const opportunities = keywordOpportunities(resume);

  let headline: string;
  if (bullets.length === 0) {
    headline = "No experience bullets found yet — add a role with a few bullets to get feedback.";
  } else if (counts.strong === bullets.length) {
    headline = "Every bullet leads with action, names real tools, and proves an outcome.";
  } else if (counts.weak > bullets.length / 2) {
    headline = `${counts.weak} of ${bullets.length} bullets need work — most are missing a strong verb, specifics, or a result.`;
  } else {
    headline = `${counts.strong} of ${bullets.length} bullets are strong. The quickest win is adding measurable outcomes to the rest.`;
  }

  return {
    bullets,
    counts,
    consistency: consistencyChecks(
      resume,
      bullets.map((b) => b.text)
    ),
    keywordOpportunities: opportunities,
    sections: recommendSections(resume),
    headline,
  };
}

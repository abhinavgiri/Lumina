/**
 * The ATS Engine — completely deterministic. No LLM, ever.
 *
 * Nine independently-scored categories, each built from explicit checks, summed
 * mathematically into an overall score. Deterministic on purpose: a score a
 * job-seeker acts on has to be reproducible and explainable ("you scored 6/15
 * on Achievements because 3 of 14 bullets carry a number"), not the opinion of a
 * model that answers differently on Tuesday.
 *
 * Two design decisions that matter for honesty:
 *
 *  1. NOT-APPLICABLE CATEGORIES. A senior engineer with no "Projects" section
 *     is not worse than a graduate who has one. Categories that don't apply are
 *     excluded from the denominator instead of scoring zero, so the overall is
 *     computed over what was actually measurable.
 *  2. KEYWORDS NEEDS A JOB DESCRIPTION. Without one there is nothing to match
 *     against, so the category reports itself as not applicable rather than
 *     inventing a number. Supplying a JD makes the score more meaningful, and
 *     the result says so.
 */
import { findSkills, matchAgainstJd } from "@/lib/ai/localEngine";
import { analyzeResumeIntelligence } from "@/lib/resume/intelligence";
import type { StructuredResume } from "@/lib/resumeTypes";

export type AtsCheck = {
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  /** What was measured, in the user's terms. */
  detail: string;
  /** What to do about it — omitted when the check passed. */
  fix?: string;
};

export type AtsCategoryId =
  | "atsCompatibility"
  | "contact"
  | "formatting"
  | "keywords"
  | "experience"
  | "skills"
  | "achievements"
  | "projects"
  | "grammar";

export type AtsCategory = {
  id: AtsCategoryId;
  label: string;
  /** Why this category is weighted the way it is. */
  rationale: string;
  score: number;
  maxScore: number;
  /** Excluded from the overall when the resume gives nothing to measure. */
  applicable: boolean;
  checks: AtsCheck[];
};

export type AtsReport = {
  /** 0-100, computed over APPLICABLE categories only. */
  overall: number;
  categories: AtsCategory[];
  /** True when a job description informed the Keywords category. */
  jdAware: boolean;
  /** Highest-impact fixes, most points recoverable first. */
  topFixes: { category: string; fix: string; points: number }[];
};

/** Maximum points per category. Sums to 100 when everything applies. */
const WEIGHTS: Record<AtsCategoryId, number> = {
  atsCompatibility: 15,
  contact: 8,
  formatting: 12,
  keywords: 15,
  experience: 15,
  achievements: 15,
  skills: 10,
  projects: 5,
  grammar: 5,
};

const RATIONALE: Record<AtsCategoryId, string> = {
  atsCompatibility: "If the parser can't read the file, nothing else on this list matters.",
  contact: "A recruiter who can't contact you can't hire you.",
  formatting: "Clear headings and a sane length let both parsers and humans find things.",
  keywords: "Screening filters on the words the job description actually uses.",
  experience: "Roles, employers and dates are the core of what's being assessed.",
  achievements: "Quantified outcomes are the single biggest differentiator between resumes.",
  skills: "A recognizable, specific skills list drives keyword matching.",
  projects: "Supporting evidence — decisive for juniors, optional once you have a track record.",
  grammar: "Errors cost credibility even when everything else is strong.",
};

const LABELS: Record<AtsCategoryId, string> = {
  atsCompatibility: "ATS compatibility",
  contact: "Contact information",
  formatting: "Formatting",
  keywords: "Keywords",
  experience: "Experience",
  achievements: "Achievements",
  skills: "Skills",
  projects: "Projects",
  grammar: "Grammar",
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;
const SECTION_RES: Record<string, RegExp> = {
  Summary: /\b(summary|objective|profile)\b/i,
  Skills: /\b(skills|core competencies|technical skills)\b/i,
  Experience: /\b(experience|employment|work history)\b/i,
  Education: /\b(education|academic)\b/i,
};

/** Award points proportionally, capped at the maximum. */
const scale = (ratio: number, max: number) => Math.round(Math.max(0, Math.min(1, ratio)) * max);

function category(
  id: AtsCategoryId,
  checks: AtsCheck[],
  applicable = true
): AtsCategory {
  return {
    id,
    label: LABELS[id],
    rationale: RATIONALE[id],
    score: checks.reduce((n, c) => n + c.points, 0),
    maxScore: WEIGHTS[id],
    applicable,
    checks,
  };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function atsCompatibility(text: string): AtsCategory {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const fragmentRatio = lines.filter((l) => l.trim().length <= 2).length / Math.max(lines.length, 1);
  const wideGaps = /[ \t]{4,}/.test(text);
  // Private-use glyphs and ligatures survive only when extraction went wrong.
  const badGlyphs = /[-ﬀ-ﬆ]/.test(text);

  return category("atsCompatibility", [
    {
      label: "Single-column, no table artifacts",
      passed: fragmentRatio < 0.15 && !wideGaps,
      points: fragmentRatio < 0.15 && !wideGaps ? 8 : 0,
      maxPoints: 8,
      detail:
        fragmentRatio < 0.15 && !wideGaps
          ? "Text extracted in clean reading order."
          : "Irregular spacing or fragmented lines — a sign of tables, columns or text boxes.",
      fix: "Use a single-column layout with normal paragraphs and bullet points.",
    },
    {
      label: "Text is selectable, not an image",
      passed: text.trim().length >= 200,
      points: text.trim().length >= 200 ? 4 : 0,
      maxPoints: 4,
      detail:
        text.trim().length >= 200
          ? `${text.trim().length} characters of machine-readable text.`
          : "Very little extractable text — the file may be scanned or image-based.",
      fix: "Export a text-based PDF from Word or Google Docs, not a scan or screenshot.",
    },
    {
      label: "No corrupted characters",
      passed: !badGlyphs,
      points: badGlyphs ? 0 : 3,
      maxPoints: 3,
      detail: badGlyphs
        ? "Contains glyphs that parsers usually mangle (symbol-font bullets or ligatures)."
        : "No problem characters detected.",
      fix: "Use standard bullet points and avoid symbol fonts like Wingdings.",
    },
  ]);
}

function contact(text: string): AtsCategory {
  const hasEmail = EMAIL_RE.test(text);
  const hasPhone = PHONE_RE.test(text);
  const nearTop = EMAIL_RE.test(text.slice(0, 500)) || PHONE_RE.test(text.slice(0, 500));

  return category("contact", [
    {
      label: "Email address",
      passed: hasEmail,
      points: hasEmail ? 3 : 0,
      maxPoints: 3,
      detail: hasEmail ? "Email detected as plain text." : "No email address found.",
      fix: "Add your email as plain text near the top — not inside an image or icon.",
    },
    {
      label: "Phone number",
      passed: hasPhone,
      points: hasPhone ? 3 : 0,
      maxPoints: 3,
      detail: hasPhone ? "Phone number detected." : "No phone number found.",
      fix: "Add a phone number with country code.",
    },
    {
      label: "Contact details near the top",
      passed: nearTop,
      points: nearTop ? 2 : 0,
      maxPoints: 2,
      detail: nearTop
        ? "Contact block appears in the first part of the document."
        : "Contact details weren't found near the top — headers and footers are often skipped entirely.",
      fix: "Move contact details into the main body of the document.",
    },
  ]);
}

function formatting(text: string): AtsCategory {
  const found = Object.entries(SECTION_RES).filter(([, re]) => re.test(text));
  const missing = Object.keys(SECTION_RES).filter((k) => !found.some(([n]) => n === k));
  const words = text.split(/\s+/).filter(Boolean).length;
  const lengthOk = words >= 150 && words <= 1300;

  return category("formatting", [
    {
      label: "Standard section headings",
      passed: found.length === 4,
      points: scale(found.length / 4, 8),
      maxPoints: 8,
      detail:
        found.length === 4
          ? "Summary, Skills, Experience and Education all detected."
          : `Missing: ${missing.join(", ")}.`,
      fix: "Add clearly labelled headings so a parser can bucket your content.",
    },
    {
      label: "Reasonable length",
      passed: lengthOk,
      points: lengthOk ? 4 : words > 0 ? 2 : 0,
      maxPoints: 4,
      detail: lengthOk
        ? `About ${words} words — a healthy 1-2 pages.`
        : words < 150
          ? `Only ${words} words — too sparse to assess.`
          : `About ${words} words — likely runs past two pages.`,
      fix: words < 150 ? "Add detail to your experience and projects." : "Trim to the most relevant, recent experience.",
    },
  ]);
}

function keywords(text: string, jdText?: string): AtsCategory {
  if (!jdText || jdText.trim().length < 30) {
    return category(
      "keywords",
      [
        {
          label: "Job description supplied",
          passed: false,
          points: 0,
          maxPoints: 15,
          detail: "No job description given, so there's nothing to match against.",
          fix: "Paste a job description to score how well your resume matches it.",
        },
      ],
      false // not applicable — excluded from the overall rather than scored 0
    );
  }

  const match = matchAgainstJd(text, jdText);
  const covered = match.matchedKeywords.length;
  const total = covered + match.missingKeywords.length;
  const mustHavesMissing = match.missingMustHaves.length;

  return category("keywords", [
    {
      label: "Job description keyword coverage",
      passed: match.matchPercent >= 70,
      points: scale(match.matchPercent / 100, 10),
      maxPoints: 10,
      detail: `Your resume shows ${covered} of ${total} skills this job asks for (${match.matchPercent}% match).`,
      fix: "Where it's truthful, work the missing keywords into your bullets.",
    },
    {
      label: "Stated must-have requirements",
      passed: mustHavesMissing === 0,
      points: mustHavesMissing === 0 ? 5 : Math.max(0, 5 - mustHavesMissing * 2),
      maxPoints: 5,
      detail:
        mustHavesMissing === 0
          ? "No stated must-have requirements are missing."
          : `Missing ${mustHavesMissing} stated requirement(s): ${match.missingMustHaves.slice(0, 3).join(", ")}.`,
      fix: "Must-haves are often hard filters — address them or expect to be screened out.",
    },
  ]);
}

function experience(resume: StructuredResume, years: number): AtsCategory {
  const roles = resume.experience;
  const withDates = roles.filter((r) => r.startDate && r.endDate).length;
  const withCompany = roles.filter((r) => r.company.trim()).length;
  const withBullets = roles.filter((r) => r.bullets.length >= 2).length;

  if (roles.length === 0) {
    return category(
      "experience",
      [
        {
          label: "Work history",
          passed: false,
          points: 0,
          maxPoints: 15,
          detail: "No work experience detected.",
          fix: "Add your roles with employer, dates and a few bullets each.",
        },
      ],
      true // a resume with no experience IS a real weakness — keep it scored
    );
  }

  return category("experience", [
    {
      label: "Every role has dates",
      passed: withDates === roles.length,
      points: scale(withDates / roles.length, 6),
      maxPoints: 6,
      detail: `${withDates} of ${roles.length} roles have both a start and end date.`,
      fix: 'Use a consistent "Mon YYYY – Mon YYYY" format on every role.',
    },
    {
      label: "Every role names an employer",
      passed: withCompany === roles.length,
      points: scale(withCompany / roles.length, 4),
      maxPoints: 4,
      detail: `${withCompany} of ${roles.length} roles name a company.`,
      fix: "Add the employer next to each job title.",
    },
    {
      label: "Roles are described",
      passed: withBullets === roles.length,
      points: scale(withBullets / roles.length, 5),
      maxPoints: 5,
      detail:
        withBullets === roles.length
          ? `All ${roles.length} roles have at least two bullets${years ? ` (~${years} years total)` : ""}.`
          : `${roles.length - withBullets} role(s) have fewer than two bullets.`,
      fix: "Give each role at least two bullets, or drop it if it isn't relevant.",
    },
  ]);
}

function achievements(resume: StructuredResume): AtsCategory {
  const intel = analyzeResumeIntelligence(resume);
  const bullets = intel.bullets;

  if (bullets.length === 0) {
    return category(
      "achievements",
      [
        {
          label: "Quantified achievements",
          passed: false,
          points: 0,
          maxPoints: 15,
          detail: "No experience bullets to assess.",
          fix: "Describe what you did in each role, with outcomes.",
        },
      ],
      true
    );
  }

  const quantified = bullets.filter((b) => b.hasMetric).length;
  const strongVerbs = bullets.filter((b) => b.hasActionVerb).length;
  // A passive opener is worse than merely lacking a strong verb — it actively
  // reads as filler, so it costs a point on top of the ratio.
  const passive = bullets.filter((b) => b.issues.some((i) => i.startsWith("Starts passively"))).length;

  return category("achievements", [
    {
      label: "Bullets with a measurable outcome",
      passed: quantified / bullets.length >= 0.5,
      // Half the bullets carrying a number is a realistic target for full marks.
      points: scale(quantified / bullets.length / 0.5, 9),
      maxPoints: 9,
      detail: `${quantified} of ${bullets.length} bullets include a number, percentage or measurable result.`,
      fix: "Add volumes handled, % improvements, time saved or revenue impact to your strongest bullets.",
    },
    {
      label: "Bullets led by a strong verb",
      passed: strongVerbs / bullets.length >= 0.7 && passive === 0,
      points: Math.max(0, scale(strongVerbs / bullets.length / 0.7, 6) - passive),
      maxPoints: 6,
      detail:
        passive > 0
          ? `${strongVerbs} of ${bullets.length} bullets open with an action verb, and ${passive} start passively.`
          : `${strongVerbs} of ${bullets.length} bullets open with an action verb.`,
      fix: 'Start each bullet with a verb: "Responsible for X" → "Managed X".',
    },
  ]);
}

function skills(resume: StructuredResume, text: string): AtsCategory {
  const listed = resume.skills.filter((s) => s.trim());
  const recognized = findSkills(listed.join(", ")).length;
  const intel = analyzeResumeIntelligence(resume);
  const unlisted = intel.keywordOpportunities.length;
  const detected = findSkills(text).length;

  return category("skills", [
    {
      label: "Recognizable skills listed",
      passed: recognized >= 8,
      points: scale(recognized / 8, 6),
      maxPoints: 6,
      detail: listed.length
        ? `${recognized} of your ${listed.length} listed skills are recognized industry terms.`
        : `No skills section found (${detected} skills detected elsewhere in the text).`,
      fix: "List the specific tools, languages and platforms you've actually used.",
    },
    {
      label: "Skills you use are all listed",
      passed: unlisted === 0,
      points: unlisted === 0 ? 4 : Math.max(0, 4 - unlisted),
      maxPoints: 4,
      detail:
        unlisted === 0
          ? "Everything demonstrated in your bullets also appears in your skills list."
          : `${unlisted} skill(s) appear in your experience but not in your skills section.`,
      fix: "Add them to your skills section — parsers weight that section heavily.",
    },
  ]);
}

function projects(resume: StructuredResume): AtsCategory {
  const list = resume.projects.filter((p) => p.name.trim());
  const hasExperience = resume.experience.length > 0;

  // Projects are decisive for juniors and optional once there's a track record.
  // Scoring a senior engineer zero here would be a bug, not a signal.
  if (list.length === 0) {
    return category(
      "projects",
      [
        {
          label: "Projects listed",
          passed: false,
          points: 0,
          maxPoints: 5,
          detail: hasExperience
            ? "No projects listed — optional given your work experience."
            : "No projects and no work experience.",
          fix: "Add one or two projects with what you built and the tools used.",
        },
      ],
      !hasExperience // only counts against you when there's no work history
    );
  }

  const described = list.filter((p) => p.bullets.length > 0 || p.description.trim()).length;
  const withTech = list.filter((p) => p.tech.length > 0).length;

  return category("projects", [
    {
      label: "Projects are described",
      passed: described === list.length,
      points: scale(described / list.length, 3),
      maxPoints: 3,
      detail: `${described} of ${list.length} projects say what you built.`,
      fix: "Add a line describing what each project does and your role in it.",
    },
    {
      label: "Technologies named",
      passed: withTech === list.length,
      points: scale(withTech / list.length, 2),
      maxPoints: 2,
      detail: `${withTech} of ${list.length} projects name the technologies used.`,
      fix: "List the stack for each project — it's free keyword coverage.",
    },
  ]);
}

function grammar(text: string, resume: StructuredResume): AtsCategory {
  const intel = analyzeResumeIntelligence(resume);
  const issues = intel.consistency;
  const pronouns = (text.match(/\b(I|my|me|myself)\b/g) ?? []).length;
  const doubleSpace = / {2,}/.test(text.replace(/[\n\t]/g, " "));

  return category("grammar", [
    {
      label: "Consistent tense, punctuation and dates",
      passed: issues.length === 0,
      points: Math.max(0, 3 - issues.length),
      maxPoints: 3,
      detail:
        issues.length === 0
          ? "No consistency problems found."
          : `${issues.length} issue(s): ${issues.map((i) => i.type).join(", ")}.`,
      fix: "Pick one convention for tense, trailing punctuation and date format.",
    },
    {
      label: "Third-person voice, clean spacing",
      passed: pronouns <= 2 && !doubleSpace,
      points: (pronouns <= 2 ? 1 : 0) + (doubleSpace ? 0 : 1),
      maxPoints: 2,
      detail: [
        pronouns > 2 ? `First-person pronouns used ${pronouns} times.` : null,
        doubleSpace ? "Double spaces between words." : null,
      ]
        .filter(Boolean)
        .join(" ") || "Voice and spacing are clean.",
      fix: 'Drop "I/my" and replace double spaces with single ones.',
    },
  ]);
}

// ---------------------------------------------------------------------------

/**
 * Score a resume across all nine categories.
 *
 * `structured` is required for the categories that reason about entities
 * (experience, projects, skills); `text` is used for the ones that reason about
 * the document itself (compatibility, contact, formatting).
 */
export function scoreAts(
  text: string,
  structured: StructuredResume,
  opts: { jdText?: string; years?: number } = {}
): AtsReport {
  const categories: AtsCategory[] = [
    atsCompatibility(text),
    contact(text),
    formatting(text),
    keywords(text, opts.jdText),
    experience(structured, opts.years ?? 0),
    achievements(structured),
    skills(structured, text),
    projects(structured),
    grammar(text, structured),
  ];

  // Overall is computed over applicable categories only, so a not-applicable
  // category neither helps nor hurts.
  const applicable = categories.filter((c) => c.applicable);
  const earned = applicable.reduce((n, c) => n + c.score, 0);
  const possible = applicable.reduce((n, c) => n + c.maxScore, 0);

  const topFixes = applicable
    .flatMap((c) =>
      c.checks
        .filter((chk) => !chk.passed && chk.fix)
        .map((chk) => ({
          category: c.label,
          fix: chk.fix!,
          points: chk.maxPoints - chk.points,
        }))
    )
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  return {
    overall: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    categories,
    jdAware: Boolean(opts.jdText && opts.jdText.trim().length >= 30),
    topFixes,
  };
}

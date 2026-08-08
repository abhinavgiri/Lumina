import { runFormatChecks } from "@/lib/formatChecks";
import { scoreAts } from "@/lib/ats/engine";
import type { StructuredResume } from "@/lib/resumeTypes";
import {
  ACTION_VERBS,
  SKILLS,
  VAGUE_PHRASES,
  WEAK_BULLET_OPENERS,
  type SkillDef,
} from "@/lib/ai/skillsData";
import type {
  AiEngine,
  AnalyzeOptions,
  ContentIssue,
  ContentQualityResult,
  GrammarIssue,
  JdMatchResult,
  ResumeAnalysis,
  RoadmapResult,
  RoadmapStep,
  TailorResult,
} from "@/lib/ai/types";

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystackLower: string, term: string): boolean {
  const t = term.toLowerCase();
  // Word-boundary match; terms with symbols (c++, c#) fall back to plain includes.
  if (/^[a-z0-9 ./-]+$/i.test(t)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}([^a-z0-9]|$)`, "i").test(haystackLower);
  }
  return haystackLower.includes(t);
}

/**
 * Skills named in a piece of text, matched on word boundaries.
 *
 * Exported because the resume-intelligence layer needs exactly this — an
 * earlier version there used naive `includes()` and matched the skill "R"
 * inside any word containing an "r", producing false "you already use R"
 * suggestions. One matcher, one behaviour.
 */
export function findSkills(text: string): SkillDef[] {
  const lower = text.toLowerCase();
  return SKILLS.filter(
    (s) => containsTerm(lower, s.name) || s.aliases.some((a) => containsTerm(lower, a))
  );
}

function extractBullets(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const bullets: string[] = [];
  for (const line of lines) {
    const stripped = line.replace(/^[-•*▪◦o]\s*/, "");
    const wasBulleted = stripped !== line;
    if (stripped.length < 25 || stripped.length > 400) continue;
    // Bulleted lines, or sentence-like lines that start with a letter and aren't headings
    if (wasBulleted || (/^[A-Z]/.test(stripped) && /[a-z]/.test(stripped) && stripped.split(" ").length >= 5)) {
      if (!/^(professional|core|technical|education|certifications?|projects?|summary|experience)\b/i.test(stripped)) {
        bullets.push(stripped);
      }
    }
  }
  return bullets;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Absolute month index, so date ranges can be compared and merged. */
const monthIndex = (year: number, month = 0) => year * 12 + month;

const DATE_RANGE_RE =
  /(?:([a-z]{3,9})\.?\s+)?((?:19|20)\d{2})\s*[-–—]\s*(?:(present|current|now)|(?:([a-z]{3,9})\.?\s+)?((?:19|20)\d{2}))/gi;

/** Employment periods as [startMonth, endMonth], month-accurate where stated. */
function workIntervals(text: string): Array<[number, number]> {
  const today = new Date();
  const nowIdx = monthIndex(today.getFullYear(), today.getMonth());
  const out: Array<[number, number]> = [];

  for (const m of text.matchAll(DATE_RANGE_RE)) {
    const startYear = parseInt(m[2], 10);
    if (startYear < 1980) continue;

    const startMonth = MONTHS[(m[1] ?? "").slice(0, 3).toLowerCase()] ?? 0;
    const start = monthIndex(startYear, startMonth);

    let end: number;
    if (m[3]) {
      end = nowIdx; // "Present"
    } else {
      const endYear = parseInt(m[5], 10);
      // A bare end year means "through the end of that year".
      const endMonth = MONTHS[(m[4] ?? "").slice(0, 3).toLowerCase()] ?? 11;
      end = monthIndex(endYear, endMonth);
    }

    if (end > start && start <= nowIdx) out.push([start, Math.min(end, nowIdx)]);
  }
  return out;
}

/**
 * Years of WORK experience.
 *
 * Two things this deliberately does not do, both of which inflated the old
 * estimate (B8):
 *
 *  1. It reads only the EXPERIENCE section. Previously every date range in the
 *     document counted, so a 2017–2021 degree made a 2021-onwards career look
 *     like nine years — which also silently suppressed the "JD asks for more
 *     years than you have" warning, the one place the number actually matters.
 *  2. It sums merged periods rather than measuring first-date to last-date, so
 *     a career break isn't counted as experience, and two concurrent roles at
 *     one employer aren't counted twice.
 */
function estimateResumeYears(text: string): number {
  const experienceText = splitSections(text).experience.join("\n");
  // Fall back to the whole document only when no experience section was found;
  // a wrong-but-present number beats reporting none at all.
  const intervals = workIntervals(experienceText || text);
  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [curStart, curEnd] = intervals[0];
  for (const [s, e] of intervals.slice(1)) {
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e); // overlapping / concurrent roles
    } else {
      months += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  months += curEnd - curStart;

  return Math.min(Math.round(months / 12), 40);
}

// ---------------------------------------------------------------------------
// Content quality (rule-based)
// ---------------------------------------------------------------------------

function scoreContentQuality(resumeText: string, targetRole?: string): ContentQualityResult {
  const bullets = extractBullets(resumeText);
  const issues: ContentIssue[] = [];
  const lower = resumeText.toLowerCase();

  // Quantified achievements /15
  const quantified = bullets.filter((b) => /\d/.test(b));
  const quantRatio = bullets.length ? quantified.length / bullets.length : 0;
  const quantScore = Math.round(Math.min(1, quantRatio / 0.5) * 15); // 50%+ quantified = full marks
  if (quantRatio < 0.5 && bullets.length) {
    const example = bullets.find((b) => !/\d/.test(b));
    issues.push({
      category: "Quantified achievements",
      detail: `Only ${quantified.length} of ${bullets.length} bullets include a number, percentage, or measurable outcome.${example ? ` For example: "${example.slice(0, 90)}…"` : ""}`,
      fix: "Add concrete metrics — volumes handled, % improvements, time saved, revenue impact — to your strongest bullets.",
    });
  }

  // Action verbs /15
  const verbSet = new Set(ACTION_VERBS);
  const startsStrong = bullets.filter((b) => {
    const first = b.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
    return verbSet.has(first);
  });
  const weakOpeners = bullets.filter((b) =>
    WEAK_BULLET_OPENERS.some((w) => b.toLowerCase().startsWith(w))
  );
  const verbRatio = bullets.length ? startsStrong.length / bullets.length : 0;
  const verbScore = Math.max(0, Math.round(Math.min(1, verbRatio / 0.7) * 15) - weakOpeners.length);
  if (weakOpeners.length) {
    issues.push({
      category: "Weak bullet openers",
      detail: `${weakOpeners.length} bullet(s) start with passive phrasing like "${weakOpeners[0].split(" ").slice(0, 3).join(" ")}…".`,
      fix: 'Lead with a strong verb: "Responsible for managing X" → "Managed X".',
    });
  } else if (verbRatio < 0.5 && bullets.length) {
    issues.push({
      category: "Action verbs",
      detail: `Only ${startsStrong.length} of ${bullets.length} bullets open with a strong action verb.`,
      fix: 'Start each bullet with verbs like "Built", "Reduced", "Automated", "Led".',
    });
  }

  // Clear titles & dates /10
  const dateRanges = resumeText.match(/(20\d{2}|19\d{2})\s*[-–—]\s*(20\d{2}|19\d{2}|present|current)/gi) ?? [];
  const monthDates = resumeText.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+20\d{2}/gi) ?? [];
  const dateSignals = dateRanges.length + monthDates.length;
  const datesScore = dateSignals >= 3 ? 10 : dateSignals === 2 ? 7 : dateSignals === 1 ? 4 : 0;
  if (datesScore < 10) {
    issues.push({
      category: "Titles & dates",
      detail: "Employment dates are sparse or inconsistently formatted, which makes tenure hard for an ATS to parse.",
      fix: 'Use a consistent "Mon YYYY – Mon YYYY" format next to every role.',
    });
  }

  // Skill coverage /10
  const resumeSkills = findSkills(resumeText);
  let skillScore = Math.min(10, Math.round(resumeSkills.length * 0.8));
  if (targetRole) {
    const roleSkills = findSkills(targetRole);
    const covered = roleSkills.filter((s) => resumeSkills.includes(s));
    if (roleSkills.length > 0 && covered.length < roleSkills.length) {
      skillScore = Math.max(0, skillScore - 2);
    }
  }
  if (resumeSkills.length < 8) {
    issues.push({
      category: "Skill coverage",
      detail: `Only ${resumeSkills.length} recognizable hard skills were detected in the resume.`,
      fix: "Expand your skills section with the specific tools, languages, and platforms you've actually used.",
    });
  }

  // Vague filler /10
  const fillerHits = VAGUE_PHRASES.filter((p) => lower.includes(p));
  const fillerScore = Math.max(0, 10 - fillerHits.length * 3);
  if (fillerHits.length) {
    issues.push({
      category: "Vague filler",
      detail: `Found cliché phrasing: ${fillerHits.map((f) => `"${f}"`).join(", ")}.`,
      fix: "Replace generic claims with a specific, evidenced achievement.",
    });
  }

  const subscores = {
    quantifiedAchievements: quantScore,
    actionVerbs: verbScore,
    clearTitlesAndDates: datesScore,
    skillCoverage: skillScore,
    noVagueFiller: fillerScore,
  };

  return {
    score: Object.values(subscores).reduce((a, b) => a + b, 0),
    maxScore: 60,
    subscores,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Grammar / language checks (rule-based)
// ---------------------------------------------------------------------------

function checkGrammar(text: string): GrammarIssue[] {
  const issues: GrammarIssue[] = [];

  if (/ {2,}/.test(text.replace(/\n/g, " ").replace(/\t/g, " "))) {
    issues.push({
      type: "Spacing",
      detail: "Double spaces found between words.",
      suggestion: "Search-and-replace double spaces with single spaces before submitting.",
    });
  }

  const pronounHits = text.match(/\b(I|my|me|myself)\b/g) ?? [];
  if (pronounHits.length > 2) {
    issues.push({
      type: "First person",
      detail: `First-person pronouns appear ${pronounHits.length} times.`,
      suggestion: 'Resumes conventionally drop "I/my": "I managed a team" → "Managed a team of…".',
    });
  }

  const repeated = text.match(/\b(\w{3,})\s+\1\b/i);
  if (repeated) {
    issues.push({
      type: "Repeated word",
      detail: `Duplicated word detected: "…${repeated[0]}…".`,
      suggestion: "Remove the duplicate word.",
    });
  }

  const sentences = text.split(/[.!?]\s/).filter((s) => s.trim().length > 0);
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 40);
  if (longSentences.length) {
    issues.push({
      type: "Sentence length",
      detail: `${longSentences.length} sentence(s) run over 40 words.`,
      suggestion: "Split long sentences into two, or convert them into separate bullets.",
    });
  }

  const bullets = extractBullets(text);
  if (bullets.length >= 4) {
    const withPeriod = bullets.filter((b) => /\.\s*$/.test(b)).length;
    if (withPeriod > 0 && withPeriod < bullets.length) {
      issues.push({
        type: "Punctuation consistency",
        detail: `${withPeriod} of ${bullets.length} bullets end with a period while the rest don't.`,
        suggestion: "Pick one convention (with or without trailing periods) and apply it to every bullet.",
      });
    }
  }

  const lowercaseI = text.match(/(^|\s)i(\s|'m|'ve)/g);
  if (lowercaseI) {
    issues.push({
      type: "Capitalization",
      detail: 'Lowercase "i" used as a pronoun.',
      suggestion: 'Capitalize "I" — or better, restructure to drop the pronoun entirely.',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// JD match
// ---------------------------------------------------------------------------

export function matchAgainstJd(resumeText: string, jdText: string): JdMatchResult {
  const jdSkills = findSkills(jdText);
  const resumeSkills = new Set(findSkills(resumeText).map((s) => s.name));

  const matched = jdSkills.filter((s) => resumeSkills.has(s.name));
  const missing = jdSkills.filter((s) => !resumeSkills.has(s.name));

  // Must-haves: skills mentioned on "required"-style lines
  const requiredLines = jdText
    .split(/\r?\n/)
    .filter((l) => /(required|must[- ]have|mandatory|minimum qualification|essential)/i.test(l));
  const requiredText = requiredLines.join("\n");
  const mustHaveSkills = findSkills(requiredText).map((s) => s.name);
  const missingMustHaves = missing.filter((s) => mustHaveSkills.includes(s.name)).map((s) => s.name);

  // Degree must-haves
  const degreeMatch = requiredText.match(/\b(bachelor'?s?|master'?s?|phd|b\.?tech|m\.?tech|mca|bca)\b[^.\n]*/i);
  if (degreeMatch && !new RegExp(escapeRegex(degreeMatch[1].replace(/'s$/i, "")), "i").test(resumeText)) {
    missingMustHaves.push(degreeMatch[0].trim().slice(0, 80));
  }

  // Experience level
  const jdYearsMatch = jdText.match(/(\d+)\s*\+?\s*years?/i);
  const jdYears = jdYearsMatch ? parseInt(jdYearsMatch[1], 10) : 0;
  const resumeYears = estimateResumeYears(resumeText);
  const mismatch = jdYears > 0 && resumeYears > 0 && resumeYears < jdYears;

  // Score: skill overlap (75%) + must-have coverage (25%)
  let matchPercent = 50;
  if (jdSkills.length > 0) {
    const overlap = matched.length / jdSkills.length;
    const mustCoverage =
      mustHaveSkills.length > 0
        ? (mustHaveSkills.length - missingMustHaves.filter((m) => mustHaveSkills.includes(m)).length) / mustHaveSkills.length
        : overlap;
    matchPercent = Math.round((overlap * 0.75 + mustCoverage * 0.25) * 100);
    if (mismatch) matchPercent = Math.max(0, matchPercent - 10);
  }

  const summary =
    jdSkills.length === 0
      ? "This job description didn't contain recognizable skill keywords, so the match is indicative only. Consider pasting the full JD including the requirements section."
      : `The resume matches ${matched.length} of ${jdSkills.length} skills the job description asks for${
          missingMustHaves.length ? `, but is missing ${missingMustHaves.length} stated must-have requirement(s)` : ""
        }.${mismatch ? ` The JD asks for ${jdYears}+ years of experience while the resume shows roughly ${resumeYears}.` : ""} ${
          matchPercent >= 75
            ? "This is a strong match — tailor the wording and apply."
            : matchPercent >= 50
              ? "A solid partial match; emphasizing overlapping skills and closing one or two gaps would help."
              : "The overlap is thin; closing the highest-priority gaps below will meaningfully improve your odds."
        }`;

  return {
    matchPercent: Math.min(100, Math.max(0, matchPercent)),
    matchedKeywords: matched.map((s) => s.name),
    missingKeywords: missing.map((s) => s.name),
    missingMustHaves: [...new Set(missingMustHaves)],
    experienceLevel: {
      jdRequires: jdYears ? `${jdYears}+ years` : "Not specified",
      resumeShows: resumeYears ? `~${resumeYears} years` : "Not clearly stated",
      mismatch,
    },
    summary,
  };
}

// ---------------------------------------------------------------------------
// Strengths / weaknesses / suggestions
// ---------------------------------------------------------------------------

function deriveInsights(
  content: ContentQualityResult,
  grammar: GrammarIssue[],
  formatScore: number,
  resumeText: string,
  jdMatch?: JdMatchResult
) {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];
  const s = content.subscores;
  const resumeSkills = findSkills(resumeText);

  if (s.quantifiedAchievements >= 11) strengths.push("Bullets are well quantified with concrete metrics and outcomes.");
  else weaknesses.push("Too few bullets carry measurable results — impact reads as unproven.");

  if (s.actionVerbs >= 11) strengths.push("Strong action-verb-led writing throughout the experience section.");
  else weaknesses.push("Several bullets open weakly instead of leading with a strong verb.");

  if (s.clearTitlesAndDates >= 8) strengths.push("Job titles and dates are clearly and consistently formatted.");
  else weaknesses.push("Employment dates are inconsistent or sparse — tenure is hard to parse.");

  if (resumeSkills.length >= 12) strengths.push(`Broad, recognizable skill coverage (${resumeSkills.length} hard skills detected).`);
  else if (resumeSkills.length < 8) weaknesses.push("The skills section is thin on recognizable, searchable keywords.");

  if (s.noVagueFiller >= 9) strengths.push("Free of cliché filler language — every claim is specific.");
  else weaknesses.push("Contains vague filler phrases that recruiters skim past.");

  if (formatScore >= 34) strengths.push("Clean, single-column, ATS-parseable layout.");
  else weaknesses.push("Formatting has ATS parsing risks (layout, sections, or contact placement).");

  if (grammar.length === 0) strengths.push("No grammar or consistency issues detected.");

  // Suggestions: top fixes ranked
  for (const issue of content.issues.slice(0, 3)) suggestions.push(issue.fix);
  for (const g of grammar.slice(0, 2)) suggestions.push(g.suggestion);
  if (jdMatch && jdMatch.missingKeywords.length) {
    suggestions.push(
      `Where truthful, work these JD keywords into your bullets: ${jdMatch.missingKeywords.slice(0, 5).join(", ")}.`
    );
  }
  if (suggestions.length === 0) suggestions.push("This resume is in strong shape — tailor the summary per application for best results.");

  return { strengths, weaknesses, suggestions: [...new Set(suggestions)] };
}

// ---------------------------------------------------------------------------
// Heuristic raw-text → structured resume parser (for tailoring uploads)
// ---------------------------------------------------------------------------

const SECTION_PATTERNS: Array<[keyof ParsedSections, RegExp]> = [
  ["summary", /^(professional\s+summary|summary|objective|profile|about\s+me)\b/i],
  [
    "skills",
    /^(core\s+(skills|competencies)|technical\s+(skills|proficienc)|areas\s+of\s+expertise|skills)\b/i,
  ],
  [
    "experience",
    /^(professional\s+experience|work\s+(experience|history)|career\s+history|experience|employment)\b/i,
  ],
  ["projects", /^((key|personal|academic)\s+)?projects?\b/i],
  ["certifications", /^(certifications?|licenses?\s*(&|and)?\s*certifications?|courses?)\b/i],
  ["education", /^(education|academic\s+(background|qualifications?))\b/i],
];

/**
 * Nouns that appear in job titles but rarely in company names — used to work out
 * which half of "A | B" is the title and which is the employer.
 */
const ROLE_WORD_RE =
  /\b(analyst|engineer|developer|manager|consultant|specialist|scientist|architect|administrator|designer|lead|intern|associate|director|officer|executive|coordinator)\b/i;

/** Strip leading bullets/decoration so "• EXPERIENCE" still reads as a heading. */
const cleanHeading = (line: string) => line.replace(/^[•\-–—*>\s]+/, "");

type ParsedSections = {
  header: string[];
  summary: string[];
  skills: string[];
  experience: string[];
  projects: string[];
  certifications: string[];
  education: string[];
};

/**
 * Split raw resume text into its labelled sections.
 *
 * Extracted so the structured parser and the years-of-experience estimate share
 * ONE definition of "where the experience section is" — they used to disagree,
 * which is how education dates ended up counted as work history (B8).
 */
function splitSections(raw: string): ParsedSections {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const sections: ParsedSections = {
    header: [], summary: [], skills: [], experience: [], projects: [], certifications: [], education: [],
  };

  let current: keyof ParsedSections = "header";
  for (const line of lines) {
    if (!line) continue;
    const headingCandidate = cleanHeading(line);
    const hit = SECTION_PATTERNS.find(([, re]) => re.test(headingCandidate) && headingCandidate.length < 60);
    if (hit) {
      current = hit[0];
      continue;
    }
    sections[current].push(line);
  }

  // Rescue: when the experience heading wasn't recognized (odd wording, glyph
  // noise), whole job entries end up inside the summary. If the summary holds
  // date-range lines and experience is empty, move that block back where it
  // belongs — a real summary never contains employment date ranges.
  const rescueDateRe =
    /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(20\d{2}|19\d{2})\s*[-–—]\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(20\d{2}|19\d{2}|present|current)/i;
  if (sections.experience.length === 0) {
    const firstDate = sections.summary.findIndex((l) => rescueDateRe.test(l));
    if (firstDate !== -1) {
      const cut = Math.max(0, firstDate - 1);
      sections.experience = sections.summary.slice(cut);
      sections.summary = sections.summary.slice(0, cut);
    }
  }
  return sections;
}

export function parseRawToStructured(raw: string): StructuredResume {
  const sections = splitSections(raw);

  const headerText = sections.header.join("\n");
  const email = headerText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] ?? "";
  const phone = headerText.match(/(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/)?.[0] ?? "";
  const name = sections.header.find((l) => !l.includes("@") && !/\d{4}/.test(l) && l.length < 60) ?? "";

  // Split skill lines carefully: lines like "Reporting (Power BI, DAX, Tableau)"
  // must not be comma-split inside the parentheses — pull the paren contents out
  // as their own skills instead.
  const skills: string[] = [];
  for (const line of sections.skills) {
    for (const segment of line.split(/[•|;\n]/)) {
      const parenGroups = [...segment.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
      const outside = segment.replace(/\([^)]*\)/g, "");
      for (const part of [...outside.split(","), ...parenGroups.flatMap((g) => g.split(","))]) {
        const clean = part.trim().replace(/^[-–—]\s*/, "");
        if (clean.length > 1 && clean.length < 60) skills.push(clean);
      }
    }
  }

  // Experience entries: a line containing a date range starts/annotates an entry
  const dateRe = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(20\d{2}|19\d{2})\s*[-–—]\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(20\d{2}|19\d{2}|present|current)/i;
  type Exp = StructuredResume["experience"][number];
  const experience: Exp[] = [];
  let currentExp: Exp | null = null;
  let pendingTitle = "";

  for (const line of sections.experience) {
    const dateMatch = line.match(dateRe);
    if (dateMatch) {
      const rest = line
        .replace(dateMatch[0], "")
        // Stripping the date out of "Deloitte (2021 - Present)" left the empty
        // brackets behind, and "Deloitte ()" reached the rendered PDF.
        .replace(/\(\s*[-–—,]?\s*\)/g, "")
        .replace(/[|\t·–—-]+\s*$/, "")
        .trim();
      const label = rest || pendingTitle || "Role";
      let [titlePart, companyPart] = label.split(/\s+[—–]\s+|\s+at\s+|\s*\|\s*|\t+/);
      // "Deloitte | Associate Analyst" and "Associate Analyst | Deloitte" are
      // both common. Job titles contain role nouns; company names generally
      // don't — so use that to decide which side is which instead of assuming.
      if (companyPart && ROLE_WORD_RE.test(companyPart) && !ROLE_WORD_RE.test(titlePart)) {
        [titlePart, companyPart] = [companyPart, titlePart];
      }
      const range = dateMatch[0].split(/\s*[-–—]\s*/);
      currentExp = {
        title: (titlePart || label).trim(),
        company: (companyPart ?? "").trim(),
        location: "",
        startDate: range[0]?.trim() ?? "",
        endDate: range[1]?.trim() ?? "Present",
        bullets: [],
      };
      experience.push(currentExp);
      pendingTitle = "";
    } else if (currentExp && line.length > 20) {
      currentExp.bullets.push(line.replace(/^[-•*▪◦]\s*/, ""));
    } else if (!currentExp || line.length <= 60) {
      pendingTitle = line;
    }
  }

  const projects: StructuredResume["projects"] = [];
  let currentProj: StructuredResume["projects"][number] | null = null;
  for (const line of sections.projects) {
    const isBullet = /^[-•*▪◦]/.test(line);
    if (!isBullet && line.length < 120 && (projects.length === 0 || line.includes("|") || /^[A-Z]/.test(line)) && line.split(" ").length <= 14) {
      const [pname, tech] = line.split(/\s*\|\s*/);
      currentProj = { name: pname.trim(), description: "", bullets: [], tech: tech ? tech.split(/,\s*/) : [] };
      projects.push(currentProj);
    } else if (currentProj) {
      currentProj.bullets.push(line.replace(/^[-•*▪◦]\s*/, ""));
    }
  }

  const certifications: StructuredResume["certifications"] = sections.certifications
    .filter((l) => l.length > 4 && !/^covers|^includes/i.test(l))
    .slice(0, 8)
    .map((l) => {
      const parts = l.split(/\s+—\s+|\s{2,}|\t/);
      return { name: parts[0]?.trim() ?? l, issuer: parts[1]?.trim() ?? "", date: parts[2]?.trim() ?? "" };
    });

  // Education lines are usually one dense string:
  //   "B.Tech Computer Science - JNTU Hyderabad (2017 - 2021) CGPA: 8.1"
  // Pull the qualification, the field of study, the school and the END year
  // apart rather than dumping the whole line into `degree`.
  const DEGREE_RE =
    /\b(bachelor(?:'?s)?(?:\s+of\s+\w+)?|master(?:'?s)?(?:\s+of\s+\w+)?|ph\.?d|b\.?tech|m\.?tech|mca|bca|b\.?sc|m\.?sc|b\.?e|m\.?e|b\.?s|m\.?s|mba|diploma)\b/i;

  const GPA_RE = /(?:cgpa|gpa|percentage)[:\s]*([\d.]+%?)/i;
  const SCHOOL_RE = /\b(university|college|institute|school|academy|polytechnic)\b/i;

  const education: StructuredResume["education"] = [];
  for (const line of sections.education) {
    const degreeMatch = line.match(DEGREE_RE);
    const last = education[education.length - 1];

    if (degreeMatch) {
      const years = [...line.matchAll(/(19|20)\d{2}/g)].map((m) => m[0]);

      // Strip dates, GPA and status words; keep the descriptive part.
      const cleaned = line
        .replace(GPA_RE, "")
        .replace(/\b(completed|expected|graduated|present|current)\b/gi, "")
        .replace(/\(?\s*(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current)\s*\)?/i, "")
        .replace(/\(?\s*(19|20)\d{2}\s*\)?/g, "")
        .replace(/\(\s*\)/g, "")
        .trim();

      // Tabs, pipes, double spaces and dashes all separate "degree | school".
      const parts = cleaned
        .split(/\t+|\s{2,}|\s*\|\s*|\s+[—–]\s+|\s+-\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const degreeSide = parts[0] ?? cleaned;
      // Prefer a part that names an institution; otherwise the next part is it
      // ("JNTU Hyderabad" contains no "university"/"college" keyword).
      const schoolSide = parts.slice(1).find((p) => SCHOOL_RE.test(p)) ?? parts[1] ?? "";

      // Two shapes are common:
      //   "Master of Computer Applications (MCA)" -> full name + abbreviation
      //   "B.Tech Computer Science"               -> qualification + field
      const abbrev = degreeSide.match(/\(([A-Za-z.]{2,10})\)/)?.[1] ?? "";
      const noParens = degreeSide.replace(/\s*\([^)]*\)\s*/g, " ").replace(/[,\s]+$/, "").trim();
      const inner = noParens.match(DEGREE_RE);
      const trailing = inner
        ? noParens.slice(inner.index! + inner[0].length).replace(/^\s*(in|of)\s+/i, "").trim()
        : "";

      const degree = abbrev || !trailing ? noParens : noParens.slice(0, noParens.length - trailing.length).trim();
      const field = abbrev || trailing;

      education.push({
        school: schoolSide,
        degree: degree || degreeMatch[0].trim(),
        field,
        startDate: years.length > 1 ? years[0] : "",
        // The END year belongs here — this used to take the first match, so a
        // "2017 - 2021" range reported 2017 as the completion year.
        endDate: years.length ? years[years.length - 1] : "",
        gpa: line.match(GPA_RE)?.[1] ?? "",
      });
    } else if (last) {
      // Continuation lines: "Graphic Era University, Dehradun | CGPA: 8.87"
      // and standalone "CGPA: 7.58" belong to the entry above.
      const gpa = line.match(GPA_RE)?.[1];
      if (gpa && !last.gpa) last.gpa = gpa;

      if (!last.school && line.length < 120) {
        const schoolText = line
          .replace(GPA_RE, "")
          .split(/\s*\|\s*|\t+/)
          .map((p) => p.trim())
          .find((p) => p && (SCHOOL_RE.test(p) || !gpa));
        if (schoolText) last.school = schoolText.replace(/[,\s|]+$/, "").trim();
      }
    }
  }

  return {
    contact: { name, email, phone, location: "", linkedin: "", portfolio: "" },
    targetRole: "",
    summary: sections.summary.join(" ").trim(),
    skills,
    experience,
    projects,
    certifications,
    education,
  };
}

// ---------------------------------------------------------------------------
// Job-query suggestion (for job search)
// ---------------------------------------------------------------------------

const ROLE_TITLE_RE =
  /\b(senior|junior|lead|principal|staff)?\s*(data engineer|data analyst|business intelligence engineer|analytics engineer|machine learning engineer|ai engineer|software engineer|full[- ]stack developer|frontend developer|backend developer|devops engineer|cloud engineer|data scientist|product manager|qa engineer|etl developer)\b/i;

/** Derive a sensible job-search query from resume content: stated role first, else top skills. */
export function suggestJobQuery(resumeText: string, targetRole?: string): string {
  if (targetRole?.trim()) return targetRole.trim();
  const roleMatch = resumeText.match(ROLE_TITLE_RE);
  if (roleMatch) return roleMatch[0].trim().toLowerCase();
  const top = findSkills(resumeText).slice(0, 2).map((s) => s.name);
  return top.length ? top.join(" ") : "software engineer";
}

// ---------------------------------------------------------------------------
// Roadmap helpers
// ---------------------------------------------------------------------------

const TIME_BY_DIFFICULTY: Record<SkillDef["difficulty"], string> = {
  easy: "1-2 weekends",
  moderate: "2-4 weeks part-time",
  hard: "1-2 months part-time",
};

const RESOURCE_BY_CATEGORY: Record<SkillDef["category"], string> = {
  language: "Official language docs plus a free interactive coding platform; solve small daily exercises.",
  data: "Official documentation and a hands-on pipeline project using a free-tier or local setup.",
  cloud: "The provider's own free-tier training path and sandbox account; build one small deployment.",
  web: "Official framework docs and tutorial; rebuild a small real project with it.",
  devops: "Official docs plus a containerized personal project deployed end-to-end.",
  ai: "Official docs / a well-known free university course; implement one small working demo.",
  analytics: "The vendor's free learning path; recreate a real dashboard with public data.",
  database: "Official docs and a local install; practice queries against a sample dataset.",
  soft: "Practice in your current role and capture concrete examples for interviews.",
  tool: "The tool's official quick-start guide; use it inside an existing project.",
};

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export class LocalAiEngine implements AiEngine {
  readonly name = "local-heuristic-v1";

  async analyzeResume(resumeText: string, opts: AnalyzeOptions = {}): Promise<ResumeAnalysis> {
    const format = runFormatChecks(resumeText);
    const content = scoreContentQuality(resumeText, opts.targetRole);
    const grammar = checkGrammar(resumeText);
    const jdMatch = opts.jdText && opts.jdText.trim().length >= 30 ? matchAgainstJd(resumeText, opts.jdText) : undefined;
    const { strengths, weaknesses, suggestions } = deriveInsights(content, grammar, format.score, resumeText, jdMatch);

    // The nine-category engine is the source of truth for the headline score.
    // `format`/`content` remain for the existing breakdown UI and are the same
    // underlying checks, viewed a different way.
    const structured = opts.structured ?? parseRawToStructured(resumeText);
    const ats = scoreAts(resumeText, structured, {
      jdText: opts.jdText,
      years: estimateResumeYears(resumeText),
    });

    return {
      atsScore: ats.overall,
      resumeQuality: Math.round((content.score / content.maxScore) * 100),
      ats,
      format,
      content,
      grammar,
      strengths,
      weaknesses,
      suggestions,
      jdMatch,
    };
  }

  async tailorResume(
    resumeText: string,
    jdText: string,
    structured: StructuredResume | null
  ): Promise<TailorResult> {
    const base = structured ?? parseRawToStructured(resumeText);
    const jdLower = jdText.toLowerCase();
    const jdSkillNames = new Set(findSkills(jdText).map((s) => s.name.toLowerCase()));
    const changes: string[] = [];

    const relevance = (text: string): number => {
      const skills = findSkills(text);
      let score = skills.filter((s) => jdSkillNames.has(s.name.toLowerCase())).length * 2;
      for (const word of text.toLowerCase().split(/[^a-z0-9+#.]+/)) {
        if (word.length > 3 && jdLower.includes(word)) score += 0.2;
      }
      return score;
    };

    // Reorder skills: JD-relevant first (never add new ones)
    const sortedSkills = [...base.skills].sort((a, b) => relevance(b) - relevance(a));
    if (sortedSkills.join() !== base.skills.join()) {
      changes.push("Reordered your skills so the ones this JD asks for appear first.");
    }

    // Reorder bullets within each role by JD relevance (keep every real bullet)
    const experience = base.experience.map((exp) => ({
      ...exp,
      bullets: [...exp.bullets].sort((a, b) => relevance(b) - relevance(a)),
    }));
    if (experience.some((e, i) => e.bullets.join() !== base.experience[i]?.bullets.join())) {
      changes.push("Moved each role's most JD-relevant bullets to the top.");
    }

    const projects = [...base.projects].sort(
      (a, b) => relevance([b.name, ...b.tech, ...b.bullets].join(" ")) - relevance([a.name, ...a.tech, ...a.bullets].join(" "))
    );
    if (projects.map((p) => p.name).join() !== base.projects.map((p) => p.name).join()) {
      changes.push("Reordered projects to lead with the most relevant work.");
    }

    changes.push("Kept all employers, titles, dates, and facts exactly as written — nothing was invented.");

    const match = matchAgainstJd(resumeText, jdText);
    const gaps = [
      ...match.missingMustHaves.map((m) => `JD must-have not evidenced in your resume: ${m}`),
      ...match.missingKeywords
        .filter((k) => !match.missingMustHaves.includes(k))
        .slice(0, 6)
        .map((k) => `JD mentions "${k}" — not present in your resume, so it was left out.`),
    ];

    return {
      resume: { ...base, skills: sortedSkills, experience, projects },
      changes,
      gaps,
    };
  }

  async generateRoadmap(
    missingKeywords: string[],
    missingMustHaves: string[],
    _jdText: string,
    resumeText: string
  ): Promise<RoadmapResult> {
    const resumeSkills = findSkills(resumeText);
    const resumeCategories = new Set(resumeSkills.map((s) => s.category));
    const unique = [...new Set([...missingMustHaves, ...missingKeywords])];

    const steps: RoadmapStep[] = unique.slice(0, 8).map((skillName, idx) => {
      const def = SKILLS.find((s) => s.name.toLowerCase() === skillName.toLowerCase());
      const isMustHave = missingMustHaves.includes(skillName);
      const difficulty = def?.difficulty ?? "moderate";
      const adjacent = def ? resumeCategories.has(def.category) : false;

      return {
        skill: skillName,
        priority: isMustHave ? "high" : idx < 3 ? "medium" : "low",
        timeEstimate: adjacent && difficulty !== "easy" ? TIME_BY_DIFFICULTY.moderate : TIME_BY_DIFFICULTY[difficulty],
        resourceType: def ? RESOURCE_BY_CATEGORY[def.category] : "Official documentation plus a small hands-on project to prove it.",
        why: isMustHave
          ? "Listed as a required qualification in this JD — likely a hard filter in screening."
          : "Mentioned in the JD; showing it would strengthen keyword match and interview talking points.",
      };
    });

    const top = unique.slice(0, 2);
    const projectIdeas: string[] = [];
    if (top.length >= 1) {
      projectIdeas.push(
        `Build a small end-to-end project that uses ${top.join(" and ")} on a public dataset, publish it on GitHub with a clear README, and add it to your resume's Projects section.`
      );
    }
    if (top.length >= 2) {
      projectIdeas.push(
        `Extend an existing project on your resume to incorporate ${top[0]} — upgrading real past work reads more credibly than a standalone toy demo.`
      );
    }
    if (projectIdeas.length === 0) {
      projectIdeas.push("No significant skill gaps found — focus on tailoring wording per application rather than new learning.");
    }

    return { steps, projectIdeas };
  }
}

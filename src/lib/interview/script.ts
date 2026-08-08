/**
 * The AI Resume Interview flow: an expert-recruiter-style conversation that
 * fills a StructuredResume one natural question at a time.
 *
 * Pure state machine — the UI renders whatever step the engine is on and
 * feeds answers back. Loops (multiple jobs/projects) are handled by steps
 * returning the next step id dynamically.
 */
import type { StructuredResume } from "@/lib/resumeTypes";
import { emptyStructuredResume } from "@/lib/resumeTypes";
import { detectTech } from "@/lib/interview/enhance";
import { canonicalizeSkills } from "@/lib/ai/skillCasing";

export type StepId =
  | "intro"
  | "name"
  | "contact"
  | "links"
  | "role"
  | "summary"
  | "job_head"
  | "job_bullets"
  | "job_more"
  | "project"
  | "project_more"
  | "skills"
  | "education"
  | "certs"
  | "done";

export type Suggestion = { label: string; value: string };

export type StepResult = {
  next: StepId;
  /** Assistant's acknowledgement of the answer (shown before next question). */
  ack?: string;
  /**
   * Lines that should be rewritten by the AI (/api/ai/enhance — LLM when a
   * free key is configured, local rules otherwise). The UI fetches improved
   * versions, offers "Use polished / Keep mine", then calls apply() with the
   * chosen lines.
   */
  enhance?: {
    kind: "bullets" | "summary";
    lines: string[];
    apply: (draft: Draft, finalLines: string[]) => void;
  };
};

export type Draft = {
  resume: StructuredResume;
  /** free-text gathered so far (for skill detection) */
  corpus: string;
};

export function newDraft(): Draft {
  return { resume: emptyStructuredResume(), corpus: "" };
}

export type Step = {
  id: StepId;
  question: (d: Draft) => string;
  placeholder?: string;
  /** quick-tap suggestion chips under the input */
  suggestions?: (d: Draft) => Suggestion[];
  skippable?: boolean;
  /** multiline answers (textarea) */
  multiline?: boolean;
  /** choice-only steps render buttons instead of the text input */
  choices?: Suggestion[];
  handle: (answer: string, d: Draft) => StepResult;
};

const DATE_RE =
  /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(20\d{2}|19\d{2})\s*[-–—to]+\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(20\d{2}|19\d{2}|present|current|now)/i;

/** Title-case a mostly-lowercase phrase ("assocaite analyst" → "Assocaite Analyst" — spelling is the polish pass's job). */
function titleCase(s: string): string {
  if (!s || s !== s.toLowerCase()) return s; // user typed real casing — trust it
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function parseJobHead(answer: string) {
  let title = "", company = "", startDate = "", endDate = "Present";
  const dm = answer.match(DATE_RE);
  let rest = answer;
  if (dm) {
    rest = answer.replace(dm[0], "").replace(/[,|()–—-]+\s*$/, "").trim();
    const parts = dm[0].split(/\s*(?:[-–—]|to)\s*/i);
    startDate = parts[0]?.trim() ?? "";
    endDate = parts[1]?.trim() || "Present";
  }
  const m = rest.split(/\s+at\s+|\s*[—|]\s*|\s*,\s*/);
  title = titleCase((m[0] ?? rest).trim());
  company = titleCase((m[1] ?? "").trim());
  return { title: title || "Role", company, startDate, endDate };
}

export const STEPS: Record<StepId, Step> = {
  intro: {
    id: "intro",
    question: () =>
      "Hi! I'm your AI resume coach. 👋 I'll interview you like a recruiter would and turn your answers into a polished, ATS-ready resume — it takes about 5 minutes. Ready? First things first:\n\nWhat's your full name?",
    placeholder: "e.g. Abhinav Giri Goswami",
    handle: (a, d) => {
      d.resume.contact.name = a.trim();
      return { next: "contact", ack: `Nice to meet you, ${a.trim().split(" ")[0]}!` };
    },
  },
  name: {
    id: "name",
    question: () => "What's your full name?",
    handle: (a, d) => {
      d.resume.contact.name = a.trim();
      return { next: "contact" };
    },
  },
  contact: {
    id: "contact",
    question: () => "How can employers reach you? Share your email, phone, and city — all in one line is fine.",
    placeholder: "you@email.com, +91 98… , Hyderabad",
    handle: (a, d) => {
      const email = a.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] ?? "";
      const phone = a.match(/\+?\d[\d\s()-]{7,}\d/)?.[0]?.trim() ?? "";
      let rest = a.replace(email, "").replace(phone, "").replace(/[,;|]+/g, " ").replace(/\s{2,}/g, " ").trim();
      d.resume.contact.email = email;
      d.resume.contact.phone = phone;
      d.resume.contact.location = rest;
      return { next: "links", ack: "Got it." };
    },
  },
  links: {
    id: "links",
    question: () => "Any LinkedIn or portfolio/GitHub links to include? (You can Skip this.)",
    placeholder: "linkedin.com/in/you, github.com/you",
    skippable: true,
    handle: (a, d) => {
      for (const raw of a.split(/[\s,]+/).filter(Boolean)) {
        if (/linkedin/i.test(raw)) d.resume.contact.linkedin = raw;
        else if (/\w\.\w/.test(raw)) d.resume.contact.portfolio = raw;
      }
      return { next: "role", ack: "Added." };
    },
  },
  role: {
    id: "role",
    question: () => "What role are you targeting? This shapes how I phrase everything.",
    placeholder: "e.g. Data Engineer",
    suggestions: () => [
      { label: "Data Engineer", value: "Data Engineer" },
      { label: "Data Analyst", value: "Data Analyst" },
      { label: "Power BI Developer", value: "Power BI Developer" },
      { label: "Full Stack Developer", value: "Full Stack Developer" },
    ],
    handle: (a, d) => {
      d.resume.targetRole = a.trim();
      return { next: "summary", ack: `${a.trim()} — great target.` };
    },
  },
  summary: {
    id: "summary",
    question: () =>
      "In 2-3 sentences, tell me about yourself professionally — what you do, what you're great at, what drives you.",
    multiline: true,
    skippable: true,
    handle: (a, d) => {
      if (!a.trim()) return { next: "job_head" }; // skipped
      d.corpus += " " + a;
      // Guard: people paste their ENTIRE old resume here. A real summary has
      // no employment date ranges and isn't 500+ chars — don't store a blob
      // as the summary (the final polish pass writes one from everything).
      if (a.length > 500 || DATE_RE.test(a)) {
        return {
          next: "job_head",
          ack: "That looks like your full resume rather than a short summary — smart, I've absorbed all of it. I'll write your 2-3 sentence summary at the end. Now let's capture each job properly:",
        };
      }
      return {
        next: "job_head",
        enhance: {
          kind: "summary",
          lines: [a.trim()],
          apply: (draft, finalLines) => {
            draft.resume.summary = finalLines[0] ?? a.trim();
          },
        },
      };
    },
  },
  job_head: {
    id: "job_head",
    question: (d) =>
      d.resume.experience.length === 0
        ? "Now your experience. Tell me about your current or most recent job — title, company, and dates."
        : "Tell me about the previous job — title, company, and dates.",
    placeholder: "Data Engineer at Deloitte, Feb 2025 - Present",
    handle: (a, d) => {
      const head = parseJobHead(a);
      d.resume.experience.push({ ...head, location: "", bullets: [] });
      d.corpus += " " + a;
      return {
        next: "job_bullets",
        ack: `${head.title}${head.company ? " at " + head.company : ""} — noted.`,
      };
    },
  },
  job_bullets: {
    id: "job_bullets",
    question: () =>
      "What did you achieve there? Give me 2-4 accomplishments, one per line.\n\nInclude any NUMBERS you remember — how many, how much time saved, how big the data, how many people. Specifics beat polish (I'll handle the wording).",
    placeholder: "Automated 15 weekly Power BI reports, saving ~8 hrs/week\nBuilt ETL pipelines on 1M+ rows with Oracle ODI",
    multiline: true,
    skippable: true,
    handle: (a, d) => {
      const lines = a.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      d.corpus += " " + a;
      if (lines.length === 0) return { next: "job_more" };
      return {
        next: "job_more",
        enhance: {
          kind: "bullets",
          lines,
          apply: (draft, finalLines) => {
            const e = draft.resume.experience[draft.resume.experience.length - 1];
            e.bullets.push(...finalLines);
          },
        },
      };
    },
  },
  job_more: {
    id: "job_more",
    question: () => "Want to add another job?",
    choices: [
      { label: "➕ Add another job", value: "yes" },
      { label: "That's all my jobs", value: "no" },
    ],
    handle: (a) => ({ next: /^y/i.test(a) ? "job_head" : "project" }),
  },
  project: {
    id: "project",
    question: () =>
      "Any project you're proud of? Give me the name, what it does, and the tech — or Skip.",
    placeholder: "Lumina — AI resume analyzer. Next.js, FastAPI, Postgres",
    multiline: true,
    skippable: true,
    handle: (a, d) => {
      if (!a.trim()) return { next: "skills" }; // skipped
      d.corpus += " " + a;
      const [head, ...restLines] = a.split(/\n+/);
      const [name, ...descParts] = head.split(/\s*[—–:-]\s+/);
      const tech = detectTech(a);
      d.resume.projects.push({
        name: (name ?? head).trim().slice(0, 80),
        description: [descParts.join(" — "), ...restLines].join(" ").trim(),
        bullets: [],
        tech,
      });
      return { next: "project_more", ack: "Love it — projects make resumes real." };
    },
  },
  project_more: {
    id: "project_more",
    question: () => "Another project?",
    choices: [
      { label: "➕ Add another project", value: "yes" },
      { label: "Move on", value: "no" },
    ],
    handle: (a) => ({ next: /^y/i.test(a) ? "project" : "skills" }),
  },
  skills: {
    id: "skills",
    question: (d) => {
      const detected = detectTech(d.corpus);
      return detected.length
        ? `Skills time. From what you've told me, I've already spotted: ${detected.join(", ")}. List everything you want on the resume (comma-separated) — or tap the chips to start.`
        : "List your key skills, comma-separated.";
    },
    placeholder: "Python, SQL, Power BI, Databricks…",
    multiline: true,
    suggestions: (d) => detectTech(d.corpus).slice(0, 8).map((s) => ({ label: `+ ${s}`, value: s })),
    handle: (a, d) => {
      const listed = a.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      const detected = detectTech(d.corpus);
      d.resume.skills = canonicalizeSkills([...listed, ...detected]);
      return { next: "education", ack: `${d.resume.skills.length} skills locked in.` };
    },
  },
  education: {
    id: "education",
    question: () => "Education — degree, school, and years?",
    placeholder: "B.Tech in Computer Science, IIT Delhi, 2016-2020",
    skippable: true,
    handle: (a, d) => {
      if (!a.trim()) return { next: "certs" }; // skipped
      const dm = a.match(/(19|20)\d{2}\s*[-–—to]+\s*(19|20)\d{2}/i);
      const parts = a.replace(dm?.[0] ?? "", "").split(/\s*,\s*|\s+from\s+/);
      const degreeField = (parts[0] ?? a).split(/\s+in\s+/i);
      d.resume.education.push({
        degree: (degreeField[0] ?? "").trim(),
        field: (degreeField[1] ?? "").trim(),
        school: (parts[1] ?? "").trim(),
        startDate: dm ? dm[0].split(/\s*[-–—]\s*|to/i)[0]?.trim() ?? "" : "",
        endDate: dm ? dm[0].split(/\s*[-–—]\s*|to/i)[1]?.trim() ?? "" : "",
        gpa: a.match(/(?:gpa|cgpa)[:\s]*([\d.]+)/i)?.[1] ?? "",
      });
      return { next: "certs", ack: "Noted." };
    },
  },
  certs: {
    id: "certs",
    question: () => "Last one — any certifications? (Name — Issuer, one per line, or Skip.)",
    placeholder: "Azure Data Engineer Associate — Microsoft",
    multiline: true,
    skippable: true,
    handle: (a, d) => {
      for (const line of a.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
        const [name, issuer, date] = line.split(/\s*[—–|]\s*|\s*,\s*/);
        d.resume.certifications.push({ name: (name ?? line).trim(), issuer: (issuer ?? "").trim(), date: (date ?? "").trim() });
      }
      return { next: "done", ack: "Perfect." };
    },
  },
  done: {
    id: "done",
    question: () => "That's everything I need! Give me a second to assemble your resume… ✨",
    handle: () => ({ next: "done" }),
  },
};

/** Steps in nominal order — used for the progress indicator. */
export const PROGRESS_ORDER: StepId[] = [
  "intro",
  "contact",
  "links",
  "role",
  "summary",
  "job_head",
  "job_bullets",
  "job_more",
  "project",
  "project_more",
  "skills",
  "education",
  "certs",
  "done",
];

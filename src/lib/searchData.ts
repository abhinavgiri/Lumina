import { SKILLS } from "@/lib/ai/skillsData";

export type SearchItem = {
  type: "Job" | "Skill" | "Keyword" | "Template";
  label: string;
  hint?: string;
};

const JOBS = [
  "Data Engineer", "Senior Data Engineer", "Data Analyst", "Business Intelligence Engineer",
  "Analytics Engineer", "Machine Learning Engineer", "AI Engineer", "Backend Engineer",
  "Full Stack Developer", "Frontend Developer", "DevOps Engineer", "Cloud Engineer",
  "Software Engineer", "Data Scientist", "Product Analyst", "ETL Developer",
  "Database Administrator", "Platform Engineer", "Solutions Architect", "QA Engineer",
];

const KEYWORDS = [
  "quantified achievements", "action verbs", "ATS-safe formatting", "single-column layout",
  "keyword optimization", "professional summary", "core competencies", "measurable impact",
  "cross-functional", "stakeholder management", "scalable systems", "cost reduction",
  "performance optimization", "automation", "data-driven decisions",
];

const TEMPLATES = [
  { label: "Classic ATS", hint: "Single column, Calibri, standard headings — maximum parseability" },
  { label: "Modern Minimal", hint: "Clean single column with tight spacing for 1-page resumes" },
  { label: "Technical Deep-Dive", hint: "Skills-forward layout for engineering roles" },
  { label: "Career Changer", hint: "Leads with transferable skills and projects over titles" },
  { label: "New Graduate", hint: "Education and projects first, experience second" },
];

export const SEARCH_INDEX: SearchItem[] = [
  ...JOBS.map((label) => ({ type: "Job" as const, label })),
  ...SKILLS.map((s) => ({ type: "Skill" as const, label: s.name, hint: s.category })),
  ...KEYWORDS.map((label) => ({ type: "Keyword" as const, label })),
  ...TEMPLATES.map((t) => ({ type: "Template" as const, label: t.label, hint: t.hint })),
];

export function searchAll(query: string, limit = 12): SearchItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: SearchItem[] = [];
  const contains: SearchItem[] = [];
  for (const item of SEARCH_INDEX) {
    const l = item.label.toLowerCase();
    if (l.startsWith(q)) starts.push(item);
    else if (l.includes(q) || item.hint?.toLowerCase().includes(q)) contains.push(item);
  }
  return [...starts, ...contains].slice(0, limit);
}

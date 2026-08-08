import { llmJson } from "@/lib/ai/llmClient";
import { emptyStructuredResume, structuredResumeSchema, type StructuredResume } from "@/lib/resumeTypes";
import { canonicalizeSkills, canonicalizeText } from "@/lib/ai/skillCasing";
import { parseRawToStructured } from "@/lib/ai/localEngine";

/**
 * Deterministically fix acronym/product casing the LLM gets wrong, and drop
 * empty entries (the model sometimes echoes the empty template shape from the
 * prompt, producing blank projects/certs that render as lone bullets).
 */
export function normalizeCasing(r: StructuredResume): StructuredResume {
  return {
    ...r,
    targetRole: canonicalizeText(r.targetRole),
    summary: canonicalizeText(r.summary),
    skills: canonicalizeSkills(r.skills.filter((s) => s.trim())),
    experience: r.experience
      .filter((e) => e.title.trim() || e.company.trim())
      .map((e) => ({
        ...e,
        title: canonicalizeText(e.title),
        bullets: e.bullets.map(canonicalizeText).filter((b) => b.trim()),
      })),
    projects: r.projects
      .filter((p) => p.name.trim())
      .map((p) => ({
        ...p,
        description: canonicalizeText(p.description),
        bullets: p.bullets.map(canonicalizeText).filter((b) => b.trim()),
        tech: canonicalizeSkills(p.tech.filter((t) => t.trim())),
      })),
    certifications: r.certifications.filter((c) => c.name.trim()),
    education: r.education.filter((e) => e.school.trim() || e.degree.trim()),
  };
}

const SYSTEM_PROMPT = `You are a top-tier technical resume editor. You receive a resume as JSON. Return the SAME JSON structure, upgraded:
- "summary": 2-3 SHARP sentences that lead with the candidate's specialization and their actual tools/domains (from experience/skills). If it's a pasted blob or contains job entries, distill it; if empty, write one from the experience. NO generic openers.
- Every experience bullet: [strong past-tense verb] + [specific what, naming the real tools/systems/scope] + [concrete outcome].
- PRESERVE EVERY concrete detail from the input — all numbers (500+, 1M+ rows), named systems (Oracle Fusion BICC, load plans), architectures (Medallion), and metrics. NEVER drop or compress these away; lengthen the bullet if needed (up to ~30 words). Losing a real detail is a failure.
- Only thin bullets with no detail should stay short; rich bullets must keep all their substance.
- Fix ALL spelling and grammar. Job titles/companies in proper Title Case. Keep acronyms UPPERCASE exactly: BI, ETL, ELT, SQL, DAX, KPI, AI, ML, NLP, API, ODI, BICC, PVO, SLA, JIRA (e.g. "Power BI" not "Power Bi", "ETL" not "Etl").
- Deduplicate near-identical bullets and skills.
- BANNED phrases (never output): "results-driven", "proven ability", "enhance productivity", "detail-oriented", "team player", "responsible for", "worked on", "leverage", "utilize", "seamless", "passionate about", "various".
- STRICT: never invent employers, job titles, dates, tools, certifications, or numeric metrics not in the input. Keep all dates and contact details EXACTLY as given. Do not add or remove array entries.
Return ONLY the JSON object.`;

export type PolishResult = {
  resume: StructuredResume;
  engine: "groq" | "gemini" | "local";
};

/**
 * Whole-resume professional pass: rewrites the summary, strengthens bullets
 * (preserving every real detail/metric), fixes casing/typos, dedupes.
 * LLM-backed when a free key is configured; deterministic casing normalization
 * always runs. Never invents facts, never changes identity/dates/counts —
 * output is schema-validated and identity-checked, else the input is returned.
 */
export async function polishStructuredResume(
  resume: StructuredResume,
  allowCloud = false
): Promise<PolishResult> {
  const llm = await llmJson<unknown>({
    system: SYSTEM_PROMPT,
    user: JSON.stringify(resume),
    allowCloud,
    maxTokens: 4000,
    temperature: 0.45,
  });

  if (llm) {
    const out = structuredResumeSchema.safeParse(llm.data);
    if (
      out.success &&
      out.data.contact.email === resume.contact.email &&
      out.data.experience.length === resume.experience.length
    ) {
      return { resume: normalizeCasing(out.data), engine: llm.provider };
    }
    console.error("polishStructuredResume: LLM output failed validation, returning original");
  }

  return { resume: normalizeCasing(resume), engine: "local" };
}

const STRUCTURE_PROMPT = `You are a top-tier technical resume writer. You receive the RAW TEXT of a resume (often messily extracted, with sections jumbled). Convert it into a clean, structured, professional resume as JSON.

Output JSON EXACTLY this shape:
{"contact":{"name":"","email":"","phone":"","location":"","linkedin":"","portfolio":""},"targetRole":"","summary":"","skills":[],"experience":[{"title":"","company":"","location":"","startDate":"","endDate":"","bullets":[]}],"projects":[{"name":"","description":"","bullets":[],"tech":[]}],"certifications":[{"name":"","issuer":"","date":""}],"education":[{"school":"","degree":"","field":"","startDate":"","endDate":"","gpa":""}]}

RULES:
- STRUCTURE CORRECTLY: split each distinct job into its OWN experience entry (title, company, dates, bullets). If jobs are jammed into the summary or run together, separate them properly. Same for education and projects.
- "summary": write a SHARP 2-3 sentence professional summary leading with the specialization and real tools/domains. Do NOT dump the whole resume into it.
- Every bullet: strong past-tense verb + specific what (real tools/systems/scope) + outcome. PRESERVE every number, metric, named system, and architecture (500+, 1M+ rows, Oracle Fusion BICC, Medallion, load plans). Never drop them.
- Fix ALL spelling/grammar/casing. Title Case names/titles. Acronyms UPPERCASE: BI, ETL, SQL, DAX, KPI, AI, ML, NLP, ODI, BICC, PVO, SLA, JIRA, OTC (e.g. "Power BI" not "Power Bi").
- BANNED phrases: "results-driven", "proven ability", "enhance productivity", "detail-oriented", "team player", "responsible for", "worked on", "leverage", "utilize", "seamless", "passionate about", "various".
- STRICT: extract only facts present in the text. Never invent employers, roles, dates, tools, or numeric metrics. Keep the person's real name, email, phone, and all dates exactly as they appear.
- Empty-string any field you can't find. Return ONLY the JSON object.`;

/**
 * Build a clean structured resume from raw resume TEXT using the LLM (which
 * parses + restructures + polishes in one step — far better than the heuristic
 * parser at understanding messy layouts). Falls back to parseRawToStructured
 * when no LLM is configured or the output is invalid.
 *
 * Identity guard: the email in the LLM output must match the email found in
 * the source text (when present), so the model can't fabricate a different
 * person.
 */
export async function structureResumeFromText(
  rawText: string,
  allowCloud = false
): Promise<PolishResult> {
  const sourceEmail = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]?.toLowerCase();

  const llm = await llmJson<unknown>({
    system: STRUCTURE_PROMPT,
    user: rawText.slice(0, 12000),
    allowCloud,
    maxTokens: 4000,
    temperature: 0.4,
  });

  if (llm) {
    // Merge onto an empty resume so missing keys get schema defaults.
    const merged = { ...emptyStructuredResume(), ...(llm.data as object) };
    const out = structuredResumeSchema.safeParse(merged);
    const okEmail = !sourceEmail || out.success === false || out.data.contact.email.toLowerCase() === sourceEmail;
    if (out.success && out.data.experience.length > 0 && okEmail) {
      return { resume: normalizeCasing(out.data), engine: llm.provider };
    }
    console.error("structureResumeFromText: LLM output invalid or identity mismatch, using heuristic parse");
  }

  return { resume: normalizeCasing(parseRawToStructured(rawText)), engine: "local" };
}

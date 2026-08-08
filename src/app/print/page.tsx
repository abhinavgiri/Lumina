import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { structuredResumeSchema, type StructuredResume } from "@/lib/resumeTypes";
import { parseRawToStructured } from "@/lib/ai/localEngine";
import PrintTrigger from "./PrintTrigger";

export const dynamic = "force-dynamic";

export default async function PrintPage() {
  const userId = await getUserId();
  const resume = userId
    ? await prisma.resume.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } })
    : null;

  if (!resume) {
    return (
      <main className="mx-auto max-w-2xl p-12 text-center text-white/60">
        No resume on file yet — go back to the dashboard and create or upload one first.
      </main>
    );
  }

  let structured: StructuredResume | null = null;
  if (resume.structuredJson) {
    const parsed = structuredResumeSchema.safeParse(JSON.parse(resume.structuredJson));
    if (parsed.success) structured = parsed.data;
  }
  if (!structured) structured = parseRawToStructured(resume.rawText);

  const r = structured;
  const contactLine = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin, r.contact.portfolio]
    .filter(Boolean)
    .join("  |  ");

  return (
    <main className="min-h-screen bg-neutral-200 py-8 print:bg-white print:py-0">
      <PrintTrigger />
      <div className="mx-auto max-w-[210mm] bg-white px-[18mm] py-[16mm] text-black shadow-2xl print:shadow-none print:max-w-none">
        <h1 className="text-2xl font-bold">{r.contact.name}</h1>
        {contactLine && <p className="mt-1 text-xs text-neutral-700">{contactLine}</p>}

        {r.summary && (
          <>
            <h2 className="mt-5 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">Professional Summary</h2>
            <p className="mt-2 text-[13px] leading-relaxed">{r.summary}</p>
          </>
        )}

        {r.skills.length > 0 && (
          <>
            <h2 className="mt-5 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">Core Skills</h2>
            <p className="mt-2 text-[13px] leading-relaxed">{r.skills.join(", ")}</p>
          </>
        )}

        {r.experience.length > 0 && (
          <>
            <h2 className="mt-5 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">Professional Experience</h2>
            {r.experience.map((exp, i) => (
              <div key={i} className="mt-3">
                <div className="flex justify-between text-[13px]">
                  <span className="font-semibold">
                    {exp.title}
                    {exp.company ? ` — ${exp.company}` : ""}
                  </span>
                  <span className="text-neutral-600">
                    {exp.startDate} – {exp.endDate || "Present"}
                  </span>
                </div>
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-[13px] leading-relaxed">
                  {exp.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        {r.projects.length > 0 && (
          <>
            <h2 className="mt-5 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">Projects</h2>
            {r.projects.map((proj, i) => (
              <div key={i} className="mt-3">
                <p className="text-[13px] font-semibold">
                  {proj.name}
                  {proj.tech.length ? ` (${proj.tech.join(", ")})` : ""}
                </p>
                <ul className="ml-4 mt-1 list-disc space-y-0.5 text-[13px] leading-relaxed">
                  {proj.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        {r.certifications.length > 0 && (
          <>
            <h2 className="mt-5 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">Certifications</h2>
            <ul className="mt-2 space-y-0.5 text-[13px]">
              {r.certifications.map((c, i) => (
                <li key={i}>{[c.name, c.issuer, c.date].filter(Boolean).join(" — ")}</li>
              ))}
            </ul>
          </>
        )}

        {r.education.length > 0 && (
          <>
            <h2 className="mt-5 border-b border-neutral-300 pb-1 text-sm font-bold uppercase tracking-wide">Education</h2>
            {r.education.map((edu, i) => (
              <p key={i} className="mt-2 text-[13px]">
                <span className="font-semibold">
                  {edu.degree}
                  {edu.field ? ` in ${edu.field}` : ""}
                </span>
                {edu.school ? ` — ${edu.school}` : ""}
                {edu.endDate ? `  (${edu.endDate})` : ""}
                {edu.gpa ? `  ·  GPA: ${edu.gpa}` : ""}
              </p>
            ))}
          </>
        )}
      </div>
    </main>
  );
}

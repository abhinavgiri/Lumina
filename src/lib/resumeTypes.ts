import { z } from "zod";

export const contactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional().default(""),
  location: z.string().optional().default(""),
  linkedin: z.string().optional().default(""),
  portfolio: z.string().optional().default(""),
});

export const experienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional().default(""),
  startDate: z.string(),
  endDate: z.string().optional().default("Present"),
  bullets: z.array(z.string()).default([]),
});

export const projectSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(""),
  bullets: z.array(z.string()).default([]),
  tech: z.array(z.string()).default([]),
});

export const certificationSchema = z.object({
  name: z.string(),
  issuer: z.string().optional().default(""),
  date: z.string().optional().default(""),
});

export const educationSchema = z.object({
  school: z.string(),
  degree: z.string(),
  field: z.string().optional().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  gpa: z.string().optional().default(""),
});

export const structuredResumeSchema = z.object({
  contact: contactSchema,
  targetRole: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  skills: z.array(z.string()).default([]),
  experience: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  certifications: z.array(certificationSchema).default([]),
  education: z.array(educationSchema).default([]),
});

export type StructuredResume = z.infer<typeof structuredResumeSchema>;

export function structuredResumeToText(r: StructuredResume): string {
  const lines: string[] = [];

  lines.push(r.contact.name);
  lines.push(
    [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin, r.contact.portfolio]
      .filter(Boolean)
      .join(" | ")
  );
  lines.push("");

  if (r.summary) {
    lines.push("PROFESSIONAL SUMMARY");
    lines.push(r.summary);
    lines.push("");
  }

  if (r.skills.length) {
    lines.push("CORE SKILLS");
    lines.push(r.skills.join(", "));
    lines.push("");
  }

  if (r.experience.length) {
    lines.push("PROFESSIONAL EXPERIENCE");
    for (const exp of r.experience) {
      lines.push(`${exp.title} — ${exp.company}${exp.location ? ", " + exp.location : ""}`);
      lines.push(`${exp.startDate} - ${exp.endDate}`);
      for (const bullet of exp.bullets) lines.push(`- ${bullet}`);
      lines.push("");
    }
  }

  if (r.projects.length) {
    lines.push("PROJECTS");
    for (const proj of r.projects) {
      lines.push(proj.tech.length ? `${proj.name} (${proj.tech.join(", ")})` : proj.name);
      if (proj.description) lines.push(proj.description);
      for (const bullet of proj.bullets) lines.push(`- ${bullet}`);
      lines.push("");
    }
  }

  if (r.certifications.length) {
    lines.push("CERTIFICATIONS");
    for (const cert of r.certifications) {
      lines.push([cert.name, cert.issuer, cert.date].filter(Boolean).join(" — "));
    }
    lines.push("");
  }

  if (r.education.length) {
    lines.push("EDUCATION");
    for (const edu of r.education) {
      lines.push(`${edu.degree}${edu.field ? " in " + edu.field : ""} — ${edu.school}`);
      const meta = [edu.startDate && edu.endDate ? `${edu.startDate} - ${edu.endDate}` : "", edu.gpa ? `GPA: ${edu.gpa}` : ""]
        .filter(Boolean)
        .join(" | ");
      if (meta) lines.push(meta);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function emptyStructuredResume(): StructuredResume {
  return {
    contact: { name: "", email: "", phone: "", location: "", linkedin: "", portfolio: "" },
    targetRole: "",
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    certifications: [],
    education: [],
  };
}

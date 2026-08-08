import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import type { StructuredResume } from "@/lib/resumeTypes";

const FONT = "Calibri";

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    children: [new TextRun({ text, bold: true, font: FONT, size: 24 })],
  });
}

function bodyText(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT, size: opts.size ?? 22, bold: opts.bold ?? false })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    // Word draws the list bullet — strip any the text already carries.
    children: [new TextRun({ text: text.replace(/^[•\-*▪◦]+\s*/, ""), font: FONT, size: 22 })],
  });
}

export async function generateResumeDocx(resume: StructuredResume): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 40 },
      children: [new TextRun({ text: resume.contact.name, bold: true, font: FONT, size: 32 })],
    })
  );

  const contactLine = [
    resume.contact.email,
    resume.contact.phone,
    resume.contact.location,
    resume.contact.linkedin,
    resume.contact.portfolio,
  ]
    .filter(Boolean)
    .join(" | ");
  if (contactLine) children.push(bodyText(contactLine, { size: 20 }));

  if (resume.summary) {
    children.push(heading("Professional Summary"));
    children.push(bodyText(resume.summary));
  }

  if (resume.skills.length) {
    children.push(heading("Core Skills"));
    children.push(bodyText(resume.skills.join(", ")));
  }

  if (resume.experience.length) {
    children.push(heading("Professional Experience"));
    for (const exp of resume.experience) {
      children.push(
        bodyText(`${exp.title} — ${exp.company}${exp.location ? ", " + exp.location : ""}`, { bold: true })
      );
      children.push(bodyText(`${exp.startDate} - ${exp.endDate || "Present"}`, { size: 20 }));
      for (const b of exp.bullets) children.push(bullet(b));
    }
  }

  if (resume.projects.length) {
    children.push(heading("Projects"));
    for (const proj of resume.projects) {
      children.push(bodyText(proj.tech?.length ? `${proj.name} (${proj.tech.join(", ")})` : proj.name, { bold: true }));
      if (proj.description) children.push(bodyText(proj.description));
      for (const b of proj.bullets) children.push(bullet(b));
    }
  }

  if (resume.certifications.length) {
    children.push(heading("Certifications"));
    for (const cert of resume.certifications) {
      children.push(bodyText([cert.name, cert.issuer, cert.date].filter(Boolean).join(" — ")));
    }
  }

  if (resume.education.length) {
    children.push(heading("Education"));
    for (const edu of resume.education) {
      children.push(bodyText(`${edu.degree}${edu.field ? " in " + edu.field : ""} — ${edu.school}`, { bold: true }));
      const meta = [
        edu.startDate && edu.endDate ? `${edu.startDate} - ${edu.endDate}` : "",
        edu.gpa ? `GPA: ${edu.gpa}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      if (meta) children.push(bodyText(meta, { size: 20 }));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

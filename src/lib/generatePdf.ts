import PDFDocument from "pdfkit";
import type { StructuredResume } from "@/lib/resumeTypes";
import { toWinAnsi } from "@/lib/textSanitize";
import { PDF_TEMPLATES, isPdfTemplate, type PdfTemplate, type TemplateSpec } from "@/lib/resume/templates";

// Re-exported so existing importers of this module keep working.
export { PDF_TEMPLATES, isPdfTemplate };
export type { PdfTemplate, TemplateSpec };

/**
 * Server-side PDF export — designed, not just dumped.
 *
 * - Every string passes through toWinAnsi() so glyphs pdfkit's standard fonts
 *   can't encode are cleaned instead of mangled into mojibake.
 * - Single-column, machine-readable layout (ATS-safe: no tables, no images),
 *   but with real typographic hierarchy: display-size name, letterspaced
 *   small-cap section headings over hairline rules, bold role lines with
 *   right-aligned dates, comfortable leading.
 * - Four templates (see PDF_TEMPLATES) and a small accent palette matching the
 *   app's theme accents. Template behaviour is DATA, not branching.
 */

const ACCENTS: Record<string, string> = {
  violet: "#6d28d9",
  ocean: "#0e7490",
  emerald: "#047857",
  sunset: "#c2410c",
  slate: "#334155",
};

const INK = "#111827"; // body text
const SOFT = "#6b7280"; // dates, meta
const FAINT = "#9ca3af"; // contact line
const RULE = "#e5e7eb"; // hairlines

type Ctx = {
  doc: PDFKit.PDFDocument;
  accent: string;
  spec: TemplateSpec;
  left: number;
  right: number;
  width: number;
};

/** Accent colour when the template uses one, otherwise plain ink. */
const accentOr = (ctx: Ctx, fallback: string) => (ctx.spec.useAccent ? ctx.accent : fallback);

const t = (s: string) => toWinAnsi(s ?? "");

function ensureSpace(ctx: Ctx, needed: number) {
  const { doc } = ctx;
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function heading(ctx: Ctx, text: string) {
  const { doc } = ctx;
  ensureSpace(ctx, 60);
  doc.moveDown(ctx.spec.sectionGap);
  doc
    .font("Helvetica-Bold")
    .fontSize(ctx.spec.headingSize)
    .fillColor(accentOr(ctx, INK))
    .text(t(text).toUpperCase(), ctx.left, doc.y, { characterSpacing: ctx.spec.headingTracking });
  const y = doc.y + 3;
  doc
    .moveTo(ctx.left, y)
    .lineTo(ctx.right, y)
    .lineWidth(0.75)
    .strokeColor(accentOr(ctx, RULE))
    .opacity(ctx.spec.useAccent ? 0.35 : 1)
    .stroke()
    .opacity(1);
  doc.y = y + 8;
  doc.fillColor(INK);
}

function body(ctx: Ctx, text: string, opts: { bold?: boolean; size?: number; color?: string; oblique?: boolean } = {}) {
  ctx.doc
    .font(opts.bold ? "Helvetica-Bold" : opts.oblique ? "Helvetica-Oblique" : "Helvetica")
    .fontSize(opts.size ?? ctx.spec.bodySize)
    .fillColor(opts.color ?? INK)
    .text(t(text), ctx.left, ctx.doc.y, { width: ctx.width, lineGap: ctx.spec.lineGap });
}

function bullet(ctx: Ctx, text: string) {
  const { doc } = ctx;
  // The renderer draws its own bullet — strip any the text already carries.
  text = text.replace(/^[•\-*▪◦]+\s*/, "");
  ensureSpace(ctx, 24);
  const gutterX = ctx.left + 4;
  const textX = ctx.left + 16;
  const yStart = doc.y;
  doc.font("Helvetica").fontSize(ctx.spec.bodySize).fillColor(accentOr(ctx, INK));
  doc.text("•", gutterX, yStart, { lineBreak: false });
  doc.fillColor(INK).text(t(text), textX, yStart, { width: ctx.right - textX, lineGap: ctx.spec.lineGap });
  doc.moveDown(0.15);
}

/** Bold left text with a right-aligned soft date on the same baseline. */
function roleLine(ctx: Ctx, leftText: string, date: string) {
  const { doc } = ctx;
  ensureSpace(ctx, 34);
  const dateStr = t(date);
  doc.font("Helvetica").fontSize(9);
  const dateW = dateStr ? doc.widthOfString(dateStr) + 6 : 0;
  const yStart = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(ctx.spec.bodySize + 0.5)
    .fillColor(INK)
    .text(t(leftText), ctx.left, yStart, { width: ctx.width - dateW, lineGap: 1 });
  if (dateStr) {
    doc.font("Helvetica").fontSize(9).fillColor(SOFT).text(dateStr, ctx.right - dateW, yStart + 1.5, {
      width: dateW,
      align: "right",
      lineBreak: false,
    });
  }
  doc.moveDown(0.1);
}

export async function generateResumePdf(
  resume: StructuredResume,
  options: { template?: PdfTemplate; accent?: string } = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const spec = PDF_TEMPLATES[isPdfTemplate(options.template) ? options.template : "modern"];
      const doc = new PDFDocument({
        size: "A4",
        margins: spec.margins,
        info: { Title: `${resume.contact.name} — Resume`, Author: resume.contact.name },
      });
      const accent = ACCENTS[options.accent ?? "violet"] ?? ACCENTS.violet;

      const ctx: Ctx = {
        doc,
        accent,
        spec,
        left: doc.page.margins.left,
        right: doc.page.width - doc.page.margins.right,
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      };

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ---- Header: name, target role, contact ----
      doc
        .font("Helvetica-Bold")
        .fontSize(spec.nameSize)
        .fillColor("#0b1220")
        .text(t(resume.contact.name || "Your Name"), ctx.left, doc.y);
      if (resume.targetRole) {
        doc.moveDown(0.12);
        doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor(accentOr(ctx, SOFT))
          .text(t(resume.targetRole), { characterSpacing: 0.4 });
      }

      const contactBits = [
        resume.contact.email,
        resume.contact.phone,
        resume.contact.location,
        resume.contact.linkedin,
        resume.contact.portfolio,
      ].filter(Boolean);
      if (contactBits.length) {
        doc.moveDown(0.35);
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor(FAINT)
          .text(contactBits.map(t).join("   •   "), { lineGap: 2 });
      }
      const hy = doc.y + 8;
      if (spec.headerRule) {
        doc.moveTo(ctx.left, hy).lineTo(ctx.right, hy).lineWidth(1.1).strokeColor(accentOr(ctx, INK)).stroke();
      }
      doc.y = hy + 4;

      // ---- Sections ----
      if (resume.summary) {
        heading(ctx, "Professional Summary");
        body(ctx, resume.summary, { oblique: spec.obliqueSummary, color: "#374151" });
      }

      if (resume.skills.length) {
        heading(ctx, "Core Skills");
        body(ctx, resume.skills.join("  •  "), { size: 9.5, color: "#374151" });
      }

      if (resume.experience.length) {
        heading(ctx, "Professional Experience");
        resume.experience.forEach((exp, i) => {
          if (i > 0) doc.moveDown(spec.entryGap);
          const where = exp.location ? `, ${exp.location}` : "";
          roleLine(ctx, `${exp.title}${exp.company ? "  |  " + exp.company : ""}${where}`, `${exp.startDate} – ${exp.endDate || "Present"}`);
          for (const b of exp.bullets) bullet(ctx, b);
        });
      }

      if (resume.projects.length) {
        heading(ctx, "Projects");
        resume.projects.forEach((proj, i) => {
          if (i > 0) doc.moveDown(spec.entryGap);
          roleLine(ctx, proj.name, proj.tech?.length ? proj.tech.slice(0, 6).join(" · ") : "");
          if (proj.description) body(ctx, proj.description, { color: "#374151" });
          for (const b of proj.bullets) bullet(ctx, b);
        });
      }

      if (resume.certifications.length) {
        heading(ctx, "Certifications");
        for (const cert of resume.certifications) {
          bullet(ctx, [cert.name, cert.issuer, cert.date].filter(Boolean).join(" — "));
        }
      }

      if (resume.education.length) {
        heading(ctx, "Education");
        resume.education.forEach((edu, i) => {
          if (i > 0) doc.moveDown(spec.entryGap * 0.8);
          const dates = edu.startDate && edu.endDate ? `${edu.startDate} – ${edu.endDate}` : edu.endDate || "";
          roleLine(ctx, `${edu.degree}${edu.field ? " in " + edu.field : ""}  |  ${edu.school}`, dates);
          if (edu.gpa) body(ctx, `GPA: ${edu.gpa}`, { size: 9, color: SOFT });
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

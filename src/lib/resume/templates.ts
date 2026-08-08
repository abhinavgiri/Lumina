/**
 * PDF template registry — pure data, NO pdfkit import.
 *
 * This lives apart from generatePdf.ts on purpose. The template picker is a
 * client component, and importing the renderer would drag pdfkit -> fontkit ->
 * node "fs" into the browser bundle and break the build. TypeScript does not
 * catch that (the types are fine either way), only the bundler does.
 *
 * Renderer behaviour is data here, not `template === "modern"` branching, so
 * adding a template means adding a row.
 */

export type PdfTemplate = "modern" | "classic" | "compact" | "minimal";

/**
 * Template behaviour lives in this table rather than in `template === "modern"`
 * ternaries scattered through the renderer. Adding a template is now data, not
 * new branching — which is the only reason four of them stay maintainable.
 *
 * All four are single-column and text-only: no tables, no text boxes, no
 * columns. An ATS parses every one of them identically; the differences are
 * purely how they read to a human.
 */
export type TemplateSpec = {
  label: string;
  /** Shown in the picker so the choice is informed, not decorative. */
  description: string;
  /** Tint headings, rules and bullets with the accent colour. */
  useAccent: boolean;
  nameSize: number;
  bodySize: number;
  headingSize: number;
  /** Letter-spacing on section headings. */
  headingTracking: number;
  lineGap: number;
  /** Vertical space before each section heading, in lines. */
  sectionGap: number;
  /** Gap between roles, in lines. */
  entryGap: number;
  margins: { top: number; bottom: number; left: number; right: number };
  obliqueSummary: boolean;
  /** Draw the rule under the contact block. */
  headerRule: boolean;
};

export const PDF_TEMPLATES: Record<PdfTemplate, TemplateSpec> = {
  modern: {
    label: "Modern",
    description: "Accent-coloured headings and hairlines. Confident, current.",
    useAccent: true,
    nameSize: 24,
    bodySize: 10,
    headingSize: 10.5,
    headingTracking: 1.4,
    lineGap: 1.5,
    sectionGap: 1.1,
    entryGap: 0.55,
    margins: { top: 50, bottom: 50, left: 56, right: 56 },
    obliqueSummary: true,
    headerRule: true,
  },
  classic: {
    label: "Classic",
    description: "All-ink, traditional. Safest for conservative industries.",
    useAccent: false,
    nameSize: 24,
    bodySize: 10,
    headingSize: 10.5,
    headingTracking: 1.4,
    lineGap: 1.5,
    sectionGap: 1.1,
    entryGap: 0.55,
    margins: { top: 50, bottom: 50, left: 56, right: 56 },
    obliqueSummary: false,
    headerRule: true,
  },
  compact: {
    label: "Compact",
    description: "Tighter spacing and margins — fits a long resume onto one page.",
    useAccent: true,
    nameSize: 19,
    bodySize: 9,
    headingSize: 9.5,
    headingTracking: 1.1,
    lineGap: 0.8,
    sectionGap: 0.7,
    entryGap: 0.35,
    margins: { top: 36, bottom: 36, left: 42, right: 42 },
    obliqueSummary: false,
    headerRule: true,
  },
  minimal: {
    label: "Minimal",
    description: "No colour, generous whitespace. Quiet and highly legible.",
    useAccent: false,
    nameSize: 21,
    bodySize: 10,
    headingSize: 10,
    headingTracking: 2.2,
    lineGap: 2.2,
    sectionGap: 1.4,
    entryGap: 0.7,
    margins: { top: 62, bottom: 62, left: 68, right: 68 },
    obliqueSummary: false,
    headerRule: false,
  },
};

export const isPdfTemplate = (v: unknown): v is PdfTemplate =>
  typeof v === "string" && v in PDF_TEMPLATES;

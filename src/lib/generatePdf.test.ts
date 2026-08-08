/**
 * Tests for PDF export across templates.
 *
 * The generator is a black box that returns bytes, so these assert the things
 * that are actually checkable and that actually break: every template produces a
 * valid PDF, templates genuinely differ, "compact" really does fit more on a
 * page, and unknown input degrades to a working default rather than throwing.
 */
import { describe, expect, it } from "vitest";
import { generateResumePdf, PDF_TEMPLATES, isPdfTemplate, type PdfTemplate } from "@/lib/generatePdf";
import { emptyStructuredResume, type StructuredResume } from "@/lib/resumeTypes";

const TEMPLATES = Object.keys(PDF_TEMPLATES) as PdfTemplate[];

/** A long resume, so page-count differences between templates actually show. */
function bigResume(): StructuredResume {
  return {
    ...emptyStructuredResume(),
    contact: {
      name: "Abhinav Giri Goswami",
      email: "a@example.com",
      phone: "+91 90000 00000",
      location: "Hyderabad, India",
      linkedin: "",
      portfolio: "",
    },
    targetRole: "Data Engineer",
    summary:
      "Data engineer specializing in Oracle ODI and Power BI, building ETL pipelines and reporting for finance teams.",
    skills: ["SQL", "Python", "Power BI", "DAX", "Oracle ODI", "ETL", "Azure Data Factory"],
    experience: Array.from({ length: 4 }, (_, i) => ({
      title: `Role ${i + 1}`,
      company: `Company ${i + 1}`,
      location: "Hyderabad",
      startDate: "Jan 2021",
      endDate: "Dec 2023",
      bullets: Array.from(
        { length: 5 },
        (_, b) =>
          `Built ETL load plans in Oracle ODI processing 500+ PVOs daily and developed Power BI dashboards with DAX measures over 1M+ rows for stakeholder reporting (${i}-${b}).`
      ),
    })),
    education: [
      { school: "Graphic Era University", degree: "B.C.A.", field: "BCA", startDate: "2020", endDate: "2023", gpa: "8.87" },
    ],
  };
}

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("template registry", () => {
  it("exposes four templates, each with a label and a description", () => {
    expect(TEMPLATES).toHaveLength(4);
    for (const key of TEMPLATES) {
      expect(PDF_TEMPLATES[key].label).toBeTruthy();
      expect(PDF_TEMPLATES[key].description).toBeTruthy();
    }
  });

  it("validates template names", () => {
    expect(isPdfTemplate("compact")).toBe(true);
    expect(isPdfTemplate("nonsense")).toBe(false);
    expect(isPdfTemplate(undefined)).toBe(false);
  });
});

describe("generateResumePdf", () => {
  it.each(TEMPLATES)("renders a valid PDF for the %s template", async (template) => {
    const pdf = await generateResumePdf(bigResume(), { template, accent: "violet" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("produces genuinely different output per template", async () => {
    const sizes = await Promise.all(
      TEMPLATES.map((t) => generateResumePdf(bigResume(), { template: t }).then((b) => b.length))
    );
    expect(new Set(sizes).size).toBe(TEMPLATES.length);
  });

  it("compact fits the same resume in no more pages than modern", async () => {
    // The entire point of "compact" — if it doesn't do this, it's just noise.
    const [modern, compact] = await Promise.all([
      generateResumePdf(bigResume(), { template: "modern" }),
      generateResumePdf(bigResume(), { template: "compact" }),
    ]);
    expect(pageCount(compact)).toBeLessThanOrEqual(pageCount(modern));
  });

  it("falls back to a working default for an unknown template", async () => {
    const pdf = await generateResumePdf(bigResume(), {
      template: "does-not-exist" as PdfTemplate,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders an empty resume without throwing", async () => {
    const pdf = await generateResumePdf(emptyStructuredResume(), { template: "minimal" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("accepts every accent without failing", async () => {
    for (const accent of ["violet", "ocean", "emerald", "sunset", "slate", "bogus"]) {
      const pdf = await generateResumePdf(bigResume(), { template: "modern", accent });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  });
});

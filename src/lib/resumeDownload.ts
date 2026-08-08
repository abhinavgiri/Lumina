import { NextResponse } from "next/server";
import { generateResumeDocx } from "@/lib/generateDocx";
import { generateResumePdf, isPdfTemplate, type PdfTemplate } from "@/lib/generatePdf";
import { sanitizeDeep } from "@/lib/textSanitize";
import type { StructuredResume } from "@/lib/resumeTypes";

export type ResumeFormat = "pdf" | "docx";

/** Normalize the ?format= query value to a supported format (defaults to docx). */
export function resolveFormat(raw: string | null): ResumeFormat {
  return raw?.toLowerCase() === "pdf" ? "pdf" : "docx";
}

export type DownloadOptions = {
  format: ResumeFormat;
  template?: PdfTemplate;
  accent?: string;
};

/** Read format/template/accent straight from a route's search params. */
export function downloadOptionsFrom(params: URLSearchParams): DownloadOptions {
  const template = params.get("template");
  return {
    format: resolveFormat(params.get("format")),
    // Unknown values fall back to "modern" rather than erroring — a bad link
    // should still produce a resume.
    template: isPdfTemplate(template) ? template : "modern",
    accent: params.get("accent") ?? undefined,
  };
}

/**
 * Render a structured resume to the requested format and return it as a
 * downloadable NextResponse. Shared by the resume and tailored-resume routes.
 * Every string is deep-sanitized here — the single choke point that keeps
 * extraction glyphs (PUA bullets, ligatures) out of both PDF and DOCX.
 */
export async function buildResumeDownload(
  structured: StructuredResume,
  opts: DownloadOptions,
  baseName: string
): Promise<NextResponse> {
  const clean = sanitizeDeep(structured);
  const safeBase = (baseName || "Resume").replace(/\s+/g, "_");

  if (opts.format === "pdf") {
    const buffer = await generateResumePdf(clean, { template: opts.template, accent: opts.accent });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeBase}.pdf"`,
      },
    });
  }

  const buffer = await generateResumeDocx(clean);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeBase}.docx"`,
    },
  });
}

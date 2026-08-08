"use client";

/**
 * Download control with a template picker.
 *
 * Four PDF templates existed in the renderer but nothing in the UI ever passed
 * `?template=`, so every download silently used "modern" — the options were
 * unreachable. This is that missing control.
 *
 * Each option shows what it's FOR ("fits a long resume onto one page") rather
 * than a style adjective, so the choice is informed. Theme tokens only.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FileText, Check, ChevronDown } from "lucide-react";
import { PDF_TEMPLATES, type PdfTemplate } from "@/lib/resume/templates";

const TEMPLATE_ORDER: PdfTemplate[] = ["modern", "classic", "compact", "minimal"];

export default function DownloadResume({
  baseUrl,
  accent = "violet",
  label = "Download",
}: {
  /** Route that serves the file, e.g. `/api/resume/abc123/download`. */
  baseUrl: string;
  accent?: string;
  label?: string;
}) {
  const [template, setTemplate] = useState<PdfTemplate>("modern");
  const [open, setOpen] = useState(false);

  const href = (format: "pdf" | "docx") =>
    `${baseUrl}?format=${format}${format === "pdf" ? `&template=${template}&accent=${accent}` : ""}`;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={href("pdf")}
          className="btn-gradient inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-fg"
        >
          <Download className="h-3.5 w-3.5" /> {label} PDF
        </a>
        <a
          href={href("docx")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-panel/12 bg-panel/5 px-4 py-2 text-xs font-medium text-fg/70 transition-colors hover:text-fg"
        >
          <FileText className="h-3.5 w-3.5" /> DOCX
        </a>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-xl border border-panel/12 px-3 py-2 text-xs font-medium text-fg/55 transition-colors hover:text-fg"
        >
          {PDF_TEMPLATES[template].label} style
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 overflow-hidden rounded-xl border border-panel/10 bg-panel/[0.03]"
          >
            {TEMPLATE_ORDER.map((key) => {
              const spec = PDF_TEMPLATES[key];
              const active = key === template;
              return (
                <li key={key}>
                  <button
                    onClick={() => {
                      setTemplate(key);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2.5 border-b border-panel/6 px-3 py-2.5 text-left last:border-b-0 hover:bg-panel/[0.04]"
                  >
                    <Check
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-transparent"}`}
                    />
                    <span>
                      <span className="block text-xs font-medium text-fg/80">{spec.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-fg/45">
                        {spec.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li className="px-3 py-2 text-[10px] leading-relaxed text-fg/35">
              All four are single-column and text-only, so an ATS reads them identically. The
              difference is how they look to a person. DOCX always uses the standard layout.
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

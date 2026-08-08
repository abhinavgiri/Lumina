"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, Sparkles, Download, Loader2, CheckCircle2 } from "lucide-react";
import type { ResumeInfo } from "@/components/dashboard/types";
import { polishResume } from "@/lib/client/lumina";
import DownloadResume from "@/components/dashboard/DownloadResume";
import { errorMessage } from "@/lib/api/client";

/**
 * "Polish with AI" for an uploaded resume: sends it through the whole-resume
 * LLM polish (fix casing/typos, sharpen bullets while preserving every real
 * detail, rewrite the summary), saves it in place, and offers the improved
 * PDF/DOCX. This is the fastest path to a great resume for someone who already
 * has a detailed one — no re-typing.
 */
export default function PolishResumeCard({
  resume,
  onPolished,
}: {
  resume: ResumeInfo;
  onPolished: (r: ResumeInfo) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [engine, setEngine] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function polish() {
    setStatus("loading");
    setError(null);
    try {
      const data = await polishResume(resume.id);
      setEngine(data.engine);
      setStatus("done");
      onPolished({
        ...resume,
        rawText: data.rawText,
        structuredJson: JSON.stringify(data.resume),
      });
    } catch (e) {
      setError(errorMessage(e, "Polish failed. Please try again."));
      setStatus("error");
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Wand2 className="h-4 w-4" /> Polish with AI
          </p>
          <p className="mt-0.5 text-xs text-fg/50">
            Fixes wording, casing and typos, and strengthens every bullet — keeping all your real details.
          </p>
        </div>

        {status !== "done" && (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={polish}
            disabled={status === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/15 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/25 disabled:opacity-60"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Polishing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Polish my resume
              </>
            )}
          </motion.button>
        )}
      </div>

      <AnimatePresence>
        {status === "done" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-3 overflow-hidden"
          >
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Polished{" "}
              {engine === "local" ? "(offline rules — add a Groq key for full AI rewriting)" : `with ${engine === "groq" ? "Groq" : "Gemini"} AI`}
              . The preview above is updated.
            </p>
            <DownloadResume baseUrl={`/api/resume/${resume.id}/download`} />
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

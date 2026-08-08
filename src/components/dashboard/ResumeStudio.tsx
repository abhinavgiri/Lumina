"use client";

import { useState } from "react";
import { MessageSquareText, SlidersHorizontal, Bot } from "lucide-react";
import BuilderSection from "@/components/dashboard/BuilderSection";
import InterviewSection from "@/components/dashboard/InterviewSection";
import GlassCard from "@/components/fx/GlassCard";
import type { ResumeInfo } from "@/components/dashboard/types";

/**
 * Resume Studio: the AI interview is the primary way to build a resume
 * (conversational, one question at a time, auto-polished answers); the
 * classic manual form stays available as a secondary mode.
 */
export default function ResumeStudio({
  currentResume,
  onSaved,
}: {
  currentResume: ResumeInfo | null;
  onSaved: (r: ResumeInfo) => void;
}) {
  const [mode, setMode] = useState<"interview" | "manual">("interview");

  return (
    <div className="space-y-4">
      {mode === "interview" ? (
        <GlassCard className="p-6" hover={false} id="builder">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg/85">
              <Bot className="h-4 w-4 text-primary" /> AI Resume Interview
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-fg/35">
                answer naturally — I turn it into an ATS-ready resume
              </span>
              <button
                onClick={() => setMode("manual")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-panel/15 bg-panel/[0.04] px-3 py-1.5 text-xs text-fg/60 transition-colors hover:bg-panel/[0.08]"
              >
                <SlidersHorizontal className="h-3 w-3" /> Manual form
              </button>
            </div>
          </div>
          <div className="mt-4">
            <InterviewSection onSaved={onSaved} />
          </div>
        </GlassCard>
      ) : (
        <div>
          <div className="mb-3 flex justify-end">
            <button
              onClick={() => setMode("interview")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.08] px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
            >
              <MessageSquareText className="h-3 w-3" /> Switch to AI Interview
            </button>
          </div>
          <BuilderSection currentResume={currentResume} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}

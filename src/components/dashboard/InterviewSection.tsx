"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Send,
  SkipForward,
  Undo2,
  Sparkles,
  Download,
  Copy,
  Check,
  RefreshCw,
  Wand2,
  FileText,
  UserRound,
} from "lucide-react";
import { STEPS, PROGRESS_ORDER, newDraft, type Draft, type StepId } from "@/lib/interview/script";
import { generateCoverLetter, generateLinkedInSummary } from "@/lib/interview/careerDocs";
import { LocalAiEngine } from "@/lib/ai/localEngine";
import { structuredResumeToText } from "@/lib/resumeTypes";
import type { ResumeInfo } from "@/components/dashboard/types";
import { buildResume, enhanceLines, polishStructuredResume } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";

// ---------------------------------------------------------------------------
// Message model
// ---------------------------------------------------------------------------

type Msg =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; instant?: boolean }
  | {
      id: number;
      role: "polish";
      original: string[];
      improved: string[];
      resolved?: "improved" | "original";
    };

let nextId = 1;

// ---------------------------------------------------------------------------
// Assistant bubble with thinking state + token-style streaming reveal
// ---------------------------------------------------------------------------

function AssistantBubble({
  text,
  instant,
  onDone,
}: {
  text: string;
  instant?: boolean;
  onDone?: () => void;
}) {
  const [shown, setShown] = useState(instant ? text : "");
  const [thinking, setThinking] = useState(!instant);
  const doneRef = useRef(false);

  useEffect(() => {
    if (instant) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      return;
    }
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      setThinking(false);
      interval = setInterval(() => {
        i = Math.min(text.length, i + 3);
        setShown(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
        }
      }, 14);
    }, 550);
    return () => {
      clearTimeout(t);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, instant]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start gap-2.5"
    >
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-panel/10 bg-panel/[0.05] px-4 py-3 backdrop-blur-sm">
        {thinking ? (
          <span className="inline-flex items-center gap-1 py-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                className="h-1.5 w-1.5 rounded-full bg-primary/70"
              />
            ))}
          </span>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg/85">
            {shown}
            {shown.length < text.length && (
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.7, repeat: Infinity }}
                className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-primary"
              />
            )}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// The interview
// ---------------------------------------------------------------------------

type Snapshot = { stepId: StepId; draftJson: string; msgCount: number };

export default function InterviewSection({ onSaved }: { onSaved: (r: ResumeInfo) => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [stepId, setStepId] = useState<StepId>("intro");
  const [draft] = useState<Draft>(() => newDraft());
  const [input, setInput] = useState("");
  const [inputReady, setInputReady] = useState(false);
  const historyRef = useRef<Snapshot[]>([]);
  const pendingRef = useRef<{
    next: StepId;
    original: string[];
    improved: string[];
    apply: (d: Draft, lines: string[]) => void;
  } | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishStage, setFinishStage] = useState("");
  const [result, setResult] = useState<{
    resumeId: string;
    atsScore: number;
    suggestions: string[];
    coverLetter: string;
    linkedin: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);

  const step = STEPS[stepId];

  // Auto-scroll on every new message / reveal tick
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, inputReady, result]);

  const ask = useCallback((id: StepId) => {
    const s = STEPS[id];
    setMessages((m) => {
      // Record a snapshot for Back. Dedupe guards against StrictMode's
      // double-invoked updaters and against re-asking after goBack().
      const h = historyRef.current;
      const entry: Snapshot = {
        stepId: id,
        draftJson: JSON.stringify(draftRef.current.resume),
        msgCount: m.length,
      };
      const last = h[h.length - 1];
      if (!last || last.stepId !== entry.stepId || last.msgCount !== entry.msgCount) h.push(entry);
      return [...m, { id: nextId++, role: "assistant", text: s.question(draftRef.current) }];
    });
    setStepId(id);
    setInputReady(false);
  }, []);

  // Kick off
  useEffect(() => {
    if (messages.length === 0) ask("intro");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function proceed(next: StepId) {
    if (next === "done") {
      setMessages((m) => [...m, { id: nextId++, role: "assistant", text: STEPS.done.question(draft) }]);
      void finish();
      return;
    }
    ask(next);
  }

  async function submit(raw?: string) {
    const answer = (raw ?? input).trim();
    if (!answer || !inputReady) return;
    setInput("");
    setMessages((m) => [...m, { id: nextId++, role: "user", text: answer }]);
    const res = step.handle(answer, draft);

    if (res.enhance) {
      // Rewrite via /api/ai/enhance (free LLM when configured, local rules
      // otherwise), then offer "Use polished / Keep mine".
      const { kind, lines, apply } = res.enhance;
      setInputReady(false);
      setEnhancing(true);
      let improved = lines;
      try {
        const data = await enhanceLines({ kind, lines, targetRole: draft.resume.targetRole });
        if (Array.isArray(data.improved)) improved = data.improved;
      } catch {
        /* local keep */
      }
      setEnhancing(false);

      const changed = improved.some((v, i) => v.trim().toLowerCase() !== (lines[i] ?? "").trim().toLowerCase());
      if (changed) {
        pendingRef.current = { next: res.next, original: lines, improved, apply };
        setMessages((m) => [...m, { id: nextId++, role: "polish", original: lines, improved }]);
        return;
      }
      apply(draft, lines);
      setMessages((m) => [...m, { id: nextId++, role: "assistant", text: "That reads well already — keeping it as written." }]);
      proceed(res.next);
      return;
    }

    if (res.ack) {
      setMessages((m) => [...m, { id: nextId++, role: "assistant", text: res.ack!, instant: false }]);
    }
    proceed(res.next);
  }

  function resolvePolish(useImproved: boolean) {
    const pending = pendingRef.current;
    if (!pending) return;
    pending.apply(draft, useImproved ? pending.improved : pending.original);
    setMessages((m) =>
      m.map((msg) =>
        msg.role === "polish" && !msg.resolved
          ? { ...msg, resolved: useImproved ? "improved" : "original" }
          : msg
      )
    );
    pendingRef.current = null;
    proceed(pending.next);
  }

  function skip() {
    if (!inputReady) return;
    setMessages((m) => [...m, { id: nextId++, role: "user", text: "Skip" }]);
    // find the step's "next" without recording data: call handle with empty-ish marker
    const res = step.handle("", draft);
    proceed(res.next);
  }

  function goBack() {
    const h = historyRef.current;
    if (h.length < 2) return;
    h.pop(); // discard the current question's snapshot
    const prev = h[h.length - 1];
    draft.resume = JSON.parse(prev.draftJson);
    pendingRef.current = null;
    setMessages((m) => [
      ...m.slice(0, prev.msgCount),
      { id: nextId++, role: "assistant", text: STEPS[prev.stepId].question(draftRef.current) },
    ]);
    setStepId(prev.stepId);
    setInputReady(false);
  }

  async function finish() {
    setFinishing(true);
    try {
      // Final AI pass: fix casing/typos, distill the summary, strengthen
      // bullets (LLM when configured; returns input unchanged otherwise).
      setFinishStage("Polishing wording and fixing typos…");
      let resume = draft.resume;
      try {
        const pd = await polishStructuredResume(resume);
        if (pd.resume) {
          resume = pd.resume;
          draft.resume = pd.resume;
        }
      } catch {
        /* keep unpolished */
      }

      setFinishStage("Saving your resume and scoring it…");
      const data = await buildResume(resume);

      const engine = new LocalAiEngine();
      const analysis = await engine.analyzeResume(structuredResumeToText(resume), {
        targetRole: resume.targetRole,
      });

      setResult({
        resumeId: data.resumeId,
        atsScore: analysis.atsScore,
        suggestions: analysis.suggestions?.slice(0, 4) ?? [],
        coverLetter: generateCoverLetter(resume),
        linkedin: generateLinkedInSummary(resume),
      });
      onSaved({
        id: data.resumeId,
        rawText: data.rawText,
        source: "built",
        structuredJson: JSON.stringify(resume),
      });
    } catch {
      setMessages((m) => [
        ...m,
        { id: nextId++, role: "assistant", text: "Something went wrong saving your resume — you can hit Back and try again.", instant: true },
      ]);
    } finally {
      setFinishing(false);
    }
  }

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1600);
  }

  const progressIdx = Math.max(0, PROGRESS_ORDER.indexOf(stepId));
  const progress = result ? 1 : progressIdx / (PROGRESS_ORDER.length - 1);

  return (
    <div className="flex h-[640px] flex-col">
      {/* progress */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-panel/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
          animate={{ width: `${Math.round(progress * 100)}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>

      {/* transcript */}
      <div ref={scrollRef} className="mt-4 flex-1 space-y-4 overflow-y-auto pr-2">
        <AnimatePresence initial={false}>
          {messages.map((m, idx) => {
            if (m.role === "user") {
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="flex justify-end"
                >
                  <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-primary/15 px-4 py-2.5 text-sm text-fg/90 backdrop-blur-sm border border-primary/20">
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                </motion.div>
              );
            }
            if (m.role === "polish") {
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="ml-9">
                  <div className="rounded-2xl border border-secondary/25 bg-secondary/[0.06] p-4">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c4a2ff]">
                      <Wand2 className="h-3.5 w-3.5" /> I polished that for you:
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {m.improved.map((line, i) => (
                        <li key={i} className="text-sm leading-relaxed text-fg/85">
                          <span className="text-secondary">▸</span> {line}
                        </li>
                      ))}
                    </ul>
                    {!m.resolved ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => resolvePolish(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-secondary/40 bg-secondary/20 px-3.5 py-1.5 text-xs font-semibold text-[#d4bcff] transition-colors hover:bg-secondary/30"
                        >
                          <Sparkles className="h-3 w-3" /> Use polished version
                        </button>
                        <button
                          onClick={() => resolvePolish(false)}
                          className="rounded-lg border border-panel/15 bg-panel/[0.05] px-3.5 py-1.5 text-xs font-medium text-fg/65 transition-colors hover:bg-panel/[0.1]"
                        >
                          Keep as I wrote it
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-fg/40">
                        {m.resolved === "improved" ? "✓ Using the polished version" : "✓ Keeping your original"}
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            }
            const isLast = idx === messages.length - 1;
            return (
              <AssistantBubble
                key={m.id}
                text={m.text}
                instant={m.instant === true || !isLast}
                onDone={isLast ? () => setInputReady(true) : undefined}
              />
            );
          })}
        </AnimatePresence>

        {enhancing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-9 flex items-center gap-2 text-sm text-fg/60">
            <Wand2 className="h-4 w-4 animate-pulse text-secondary" /> Polishing your answer…
          </motion.div>
        )}

        {finishing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-9 flex items-center gap-2 text-sm text-fg/60">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" /> {finishStage || "Assembling your resume…"}
          </motion.div>
        )}

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="ml-9 space-y-3"
          >
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-fg/90">Your resume is ready 🎉</p>
                  <p className="mt-0.5 text-xs text-fg/50">Saved to your dashboard — analysis and job search now use it.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-bold text-emerald-300">
                    ATS {result.atsScore}/100
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`/api/resume/${result.resumeId}/download?format=pdf`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/15 px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </a>
                <a
                  href={`/api/resume/${result.resumeId}/download?format=docx`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-panel/15 bg-panel/[0.05] px-3.5 py-2 text-xs font-semibold text-fg/75 transition-colors hover:bg-panel/[0.1]"
                >
                  <Download className="h-3.5 w-3.5" /> DOCX
                </a>
              </div>
              {result.suggestions.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-fg/40">To push the score higher</p>
                  <ul className="mt-1.5 space-y-1">
                    {result.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2 text-xs text-fg/65">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-300/70" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {[
              { key: "cover", icon: FileText, title: "Cover letter", text: result.coverLetter },
              { key: "li", icon: UserRound, title: "LinkedIn summary", text: result.linkedin },
            ].map(({ key, icon: Icon, title, text }) => (
              <div key={key} className="rounded-2xl border border-panel/10 bg-panel/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg/80">
                    <Icon className="h-3.5 w-3.5 text-primary" /> {title}
                  </p>
                  <button
                    onClick={() => copy(text, key)}
                    className="inline-flex items-center gap-1 rounded-md border border-panel/15 px-2 py-1 text-[11px] text-fg/60 transition-colors hover:bg-panel/[0.08]"
                  >
                    {copied === key ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                    {copied === key ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-fg/60">
                  {text}
                </pre>
              </div>
            ))}
          </motion.div>
        )}
      </div>

      {/* composer */}
      {!result && !finishing && (
        <div className="mt-4">
          {step.choices && inputReady ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap gap-2">
              {step.choices.map((c) => (
                <button
                  key={c.value}
                  onClick={() => submit(c.value === "yes" ? "yes" : c.label)}
                  className="rounded-xl border border-primary/25 bg-primary/[0.08] px-4 py-2.5 text-sm font-medium text-fg/85 transition-all hover:border-primary/50 hover:bg-primary/15"
                >
                  {c.label}
                </button>
              ))}
            </motion.div>
          ) : (
            <>
              {inputReady && step.suggestions && step.suggestions(draft).length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {step.suggestions(draft).map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setInput((v) => (v ? `${v.replace(/,\s*$/, "")}, ${s.value}` : s.value))}
                      className="rounded-full border border-panel/15 bg-panel/[0.05] px-2.5 py-1 text-[11px] text-fg/60 transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="relative flex-1">
                  {step.multiline ? (
                    <textarea
                      className="input-dark w-full resize-none px-4 py-3 text-sm"
                      rows={3}
                      placeholder={inputReady ? step.placeholder ?? "Type your answer…" : "…"}
                      value={input}
                      disabled={!inputReady}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                    />
                  ) : (
                    <input
                      className="input-dark w-full px-4 py-3 text-sm"
                      placeholder={inputReady ? step.placeholder ?? "Type your answer…" : "…"}
                      value={input}
                      disabled={!inputReady}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                    />
                  )}
                </div>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => submit()}
                  disabled={!inputReady || !input.trim()}
                  className="btn-gradient flex h-11 w-11 items-center justify-center rounded-xl disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4 text-fg" />
                </motion.button>
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-fg/40">
                {historyRef.current.length > 1 && (
                  <button onClick={goBack} className="inline-flex items-center gap-1 transition-colors hover:text-fg/70">
                    <Undo2 className="h-3 w-3" /> Back
                  </button>
                )}
                {step.skippable && (
                  <button onClick={skip} className="inline-flex items-center gap-1 transition-colors hover:text-fg/70">
                    <SkipForward className="h-3 w-3" /> Skip
                  </button>
                )}
                {step.multiline && <span className="ml-auto">Enter to send · Shift+Enter for a new line</span>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

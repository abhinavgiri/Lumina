"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Trash2, Save, Download, Printer, PenLine } from "lucide-react";
import {
  emptyStructuredResume,
  structuredResumeSchema,
  type StructuredResume,
} from "@/lib/resumeTypes";
import type { ResumeInfo } from "@/components/dashboard/types";
import { buildResume } from "@/lib/client/lumina";
import { errorMessage } from "@/lib/api/client";
import GlassCard from "@/components/fx/GlassCard";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fg/40">{label}</span>
      <input
        className="input-dark w-full px-3.5 py-2.5 text-sm"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fg/40">{label}</span>
      <textarea
        className="input-dark w-full px-3.5 py-2.5 text-sm resize-y"
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

const parseList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Comma-separated list editor that does NOT fight the user while typing.
 *
 * The old pattern (`value={items.join(", ")}` + parse-on-change) round-tripped
 * every keystroke through split/trim/filter, so the comma or space you just
 * typed was destroyed by the re-render ("java, " became "java"). This keeps
 * the raw text in local state while the field is focused, parses into the
 * parent on every change, and only normalizes the display on blur.
 */
function ListArea({
  label,
  values,
  onCommit,
  placeholder,
  rows = 4,
  multiline = true,
}: {
  label: string;
  values: string[];
  onCommit: (items: string[]) => void;
  placeholder?: string;
  rows?: number;
  multiline?: boolean;
}) {
  const [raw, setRaw] = useState(values.join(", "));
  const [editing, setEditing] = useState(false);

  // Sync from the outside (loading a saved resume, reset) — but never while typing.
  useEffect(() => {
    if (!editing) setRaw(values.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.join(" "), editing]);

  const shared = {
    className: "input-dark w-full px-3.5 py-2.5 text-sm" + (multiline ? " resize-y" : ""),
    value: raw,
    placeholder,
    onFocus: () => setEditing(true),
    onBlur: () => {
      setEditing(false);
      const parsed = parseList(raw);
      onCommit(parsed);
      setRaw(parsed.join(", "));
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setRaw(e.target.value);
      onCommit(parseList(e.target.value));
    },
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-fg/40">{label}</span>
      {multiline ? <textarea rows={rows} {...shared} /> : <input {...shared} />}
    </label>
  );
}

function Bullets({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium uppercase tracking-wider text-fg/40">Bullet points</span>
      {bullets.map((b, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input-dark flex-1 px-3.5 py-2 text-sm"
            value={b}
            placeholder="Quantified achievement, e.g. Reduced API latency 35% by…"
            onChange={(e) => {
              const next = [...bullets];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="rounded-lg border border-panel/10 px-2.5 text-fg/40 hover:text-rose-300 hover:border-rose-400/30 transition-colors"
            onClick={() => onChange(bullets.filter((_, j) => j !== i))}
            aria-label="Remove bullet"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 hover:text-violet-200 transition-colors"
        onClick={() => onChange([...bullets, ""])}
      >
        <Plus className="h-3.5 w-3.5" /> Add bullet
      </button>
    </div>
  );
}

function SubCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-panel/8 bg-panel/[0.03] p-4 space-y-3">{children}</div>;
}

function GroupHeader({ title, onAdd, addLabel }: { title: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-fg/85">{title}</h3>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-300 hover:text-violet-200 transition-colors"
        onClick={onAdd}
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  );
}

export default function BuilderSection({
  currentResume,
  onSaved,
}: {
  currentResume: ResumeInfo | null;
  onSaved: (r: ResumeInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  const [resume, setResume] = useState<StructuredResume>(() => {
    if (currentResume?.structuredJson) {
      const parsed = structuredResumeSchema.safeParse(JSON.parse(currentResume.structuredJson));
      if (parsed.success) return parsed.data;
    }
    return emptyStructuredResume();
  });
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(
    currentResume?.source === "built" ? currentResume.id : null
  );
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof StructuredResume>(key: K, value: StructuredResume[K]) {
    setResume((r) => ({ ...r, [key]: value }));
  }

  async function save() {
    if (!resume.contact.name || !resume.contact.email) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await buildResume(resume);
      setSavedId(data.resumeId);
      onSaved({
        id: data.resumeId,
        rawText: data.rawText,
        source: "built",
        structuredJson: JSON.stringify(resume),
      });
    } catch (e) {
      setError(errorMessage(e, "Something went wrong saving your resume. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard className="overflow-hidden" hover={false} id="builder">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between p-6 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-400/20">
            <PenLine className="h-4 w-4 text-violet-300" />
          </div>
          <div>
            <h2 className="font-semibold text-fg/90">Resume Builder</h2>
            <p className="text-xs text-fg/40">Create, edit, save, and download — right here.</p>
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown className="h-5 w-5 text-fg/40" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="space-y-8 border-t border-panel/8 p-6">
              {/* Contact */}
              <section className="space-y-4">
                <h3 className="text-sm font-semibold text-fg/85">Contact</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" value={resume.contact.name} onChange={(v) => update("contact", { ...resume.contact, name: v })} />
                  <Field label="Email" value={resume.contact.email} onChange={(v) => update("contact", { ...resume.contact, email: v })} />
                  <Field label="Phone" value={resume.contact.phone} onChange={(v) => update("contact", { ...resume.contact, phone: v })} />
                  <Field label="Location" value={resume.contact.location} onChange={(v) => update("contact", { ...resume.contact, location: v })} />
                  <Field label="LinkedIn" value={resume.contact.linkedin} onChange={(v) => update("contact", { ...resume.contact, linkedin: v })} />
                  <Field label="Portfolio / GitHub" value={resume.contact.portfolio} onChange={(v) => update("contact", { ...resume.contact, portfolio: v })} />
                </div>
                <Field
                  label="Target role (sharpens scoring)"
                  value={resume.targetRole ?? ""}
                  onChange={(v) => update("targetRole", v)}
                  placeholder="e.g. Data Engineer"
                />
              </section>

              {/* Summary + skills */}
              <section className="grid gap-4 lg:grid-cols-2">
                <Area label="Professional summary" value={resume.summary} onChange={(v) => update("summary", v)} placeholder="2-3 sentences on who you are and what you bring." rows={4} />
                <ListArea
                  label="Core skills (comma-separated)"
                  values={resume.skills}
                  onCommit={(items) => update("skills", items)}
                  placeholder="Python, SQL, AWS, Power BI…"
                  rows={4}
                />
              </section>

              {/* Experience */}
              <section className="space-y-4">
                <GroupHeader
                  title="Professional experience"
                  addLabel="Add job"
                  onAdd={() =>
                    update("experience", [
                      ...resume.experience,
                      { title: "", company: "", location: "", startDate: "", endDate: "Present", bullets: [] },
                    ])
                  }
                />
                {resume.experience.map((exp, i) => (
                  <SubCard key={i}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Title" value={exp.title} onChange={(v) => { const n = [...resume.experience]; n[i] = { ...exp, title: v }; update("experience", n); }} />
                      <Field label="Company" value={exp.company} onChange={(v) => { const n = [...resume.experience]; n[i] = { ...exp, company: v }; update("experience", n); }} />
                      <Field label="Start date" value={exp.startDate} onChange={(v) => { const n = [...resume.experience]; n[i] = { ...exp, startDate: v }; update("experience", n); }} placeholder="Jan 2022" />
                      <Field label="End date" value={exp.endDate ?? ""} onChange={(v) => { const n = [...resume.experience]; n[i] = { ...exp, endDate: v }; update("experience", n); }} placeholder="Present" />
                    </div>
                    <Bullets bullets={exp.bullets} onChange={(b) => { const n = [...resume.experience]; n[i] = { ...exp, bullets: b }; update("experience", n); }} />
                    <button type="button" className="text-sm text-rose-300/80 hover:text-rose-300 transition-colors" onClick={() => update("experience", resume.experience.filter((_, j) => j !== i))}>
                      Remove this job
                    </button>
                  </SubCard>
                ))}
              </section>

              {/* Projects */}
              <section className="space-y-4">
                <GroupHeader
                  title="Projects"
                  addLabel="Add project"
                  onAdd={() => update("projects", [...resume.projects, { name: "", description: "", bullets: [], tech: [] }])}
                />
                {resume.projects.map((proj, i) => (
                  <SubCard key={i}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Project name" value={proj.name} onChange={(v) => { const n = [...resume.projects]; n[i] = { ...proj, name: v }; update("projects", n); }} />
                      <ListArea label="Tech used (comma-separated)" multiline={false} values={proj.tech} onCommit={(items) => { const n = [...resume.projects]; n[i] = { ...proj, tech: items }; update("projects", n); }} />
                    </div>
                    <Bullets bullets={proj.bullets} onChange={(b) => { const n = [...resume.projects]; n[i] = { ...proj, bullets: b }; update("projects", n); }} />
                    <button type="button" className="text-sm text-rose-300/80 hover:text-rose-300 transition-colors" onClick={() => update("projects", resume.projects.filter((_, j) => j !== i))}>
                      Remove this project
                    </button>
                  </SubCard>
                ))}
              </section>

              {/* Certifications */}
              <section className="space-y-4">
                <GroupHeader
                  title="Certifications"
                  addLabel="Add certification"
                  onAdd={() => update("certifications", [...resume.certifications, { name: "", issuer: "", date: "" }])}
                />
                {resume.certifications.map((cert, i) => (
                  <SubCard key={i}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Name" value={cert.name} onChange={(v) => { const n = [...resume.certifications]; n[i] = { ...cert, name: v }; update("certifications", n); }} />
                      <Field label="Issuer" value={cert.issuer ?? ""} onChange={(v) => { const n = [...resume.certifications]; n[i] = { ...cert, issuer: v }; update("certifications", n); }} />
                      <Field label="Date" value={cert.date ?? ""} onChange={(v) => { const n = [...resume.certifications]; n[i] = { ...cert, date: v }; update("certifications", n); }} />
                    </div>
                    <button type="button" className="text-sm text-rose-300/80 hover:text-rose-300 transition-colors" onClick={() => update("certifications", resume.certifications.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </SubCard>
                ))}
              </section>

              {/* Education */}
              <section className="space-y-4">
                <GroupHeader
                  title="Education"
                  addLabel="Add education"
                  onAdd={() => update("education", [...resume.education, { school: "", degree: "", field: "", startDate: "", endDate: "", gpa: "" }])}
                />
                {resume.education.map((edu, i) => (
                  <SubCard key={i}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="School" value={edu.school} onChange={(v) => { const n = [...resume.education]; n[i] = { ...edu, school: v }; update("education", n); }} />
                      <Field label="Degree" value={edu.degree} onChange={(v) => { const n = [...resume.education]; n[i] = { ...edu, degree: v }; update("education", n); }} />
                      <Field label="Field of study" value={edu.field ?? ""} onChange={(v) => { const n = [...resume.education]; n[i] = { ...edu, field: v }; update("education", n); }} />
                      <Field label="GPA" value={edu.gpa ?? ""} onChange={(v) => { const n = [...resume.education]; n[i] = { ...edu, gpa: v }; update("education", n); }} />
                      <Field label="Start year" value={edu.startDate ?? ""} onChange={(v) => { const n = [...resume.education]; n[i] = { ...edu, startDate: v }; update("education", n); }} />
                      <Field label="End year" value={edu.endDate ?? ""} onChange={(v) => { const n = [...resume.education]; n[i] = { ...edu, endDate: v }; update("education", n); }} />
                    </div>
                    <button type="button" className="text-sm text-rose-300/80 hover:text-rose-300 transition-colors" onClick={() => update("education", resume.education.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  </SubCard>
                ))}
              </section>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <div className="flex flex-wrap items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="btn-gradient inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-medium text-fg"
                >
                  <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save resume"}
                </motion.button>

                {savedId && (
                  <>
                    <motion.a
                      whileTap={{ scale: 0.97 }}
                      href={`/api/resume/${savedId}/download?format=pdf`}
                      className="inline-flex items-center gap-2 rounded-xl border border-panel/15 bg-panel/5 px-5 py-2.5 text-sm font-medium text-fg/85 hover:bg-panel/10 transition-colors"
                    >
                      <Download className="h-4 w-4" /> Download PDF
                    </motion.a>
                    <motion.a
                      whileTap={{ scale: 0.97 }}
                      href={`/api/resume/${savedId}/download?format=docx`}
                      className="inline-flex items-center gap-2 rounded-xl border border-panel/15 bg-panel/5 px-5 py-2.5 text-sm font-medium text-fg/85 hover:bg-panel/10 transition-colors"
                    >
                      <Download className="h-4 w-4" /> Download .docx
                    </motion.a>
                    <motion.a
                      whileTap={{ scale: 0.97 }}
                      href="/print"
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-xl border border-panel/15 bg-panel/5 px-5 py-2.5 text-sm font-medium text-fg/85 hover:bg-panel/10 transition-colors"
                    >
                      <Printer className="h-4 w-4" /> Print view
                    </motion.a>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

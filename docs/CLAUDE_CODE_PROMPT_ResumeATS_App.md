# Project Brief — Free Resume ATS Score & Career Roadmap Web App

Paste this whole document to Claude Code as your first message in the project folder to kick off the build. It's written as a project brief, not a reusable Claude "skill," because this is a one-time app to build, not a repeatable capability — Claude Code will read it once and start working from it.

## 1. Goal

Build a free, self-hosted web application that gives job seekers the resume/ATS tooling normally locked behind Claude Pro, Indeed Resume, LinkedIn Premium, or Naukri Pro — without requiring any of those subscriptions. The only paid dependency should be the developer's own Anthropic API key (pay-as-you-go, not a Pro plan).

**Target user:** someone job-hunting who cannot afford Claude Pro, Indeed/LinkedIn/Naukri premium tiers, and just wants to know "is my resume good enough for this job, and if not, what do I do about it."

## 2. Non-goals (explicitly out of scope for this app)

- No LinkedIn, Naukri, or Indeed API integration. Their job-search APIs are either partner-gated (LinkedIn: no third-party data access approved since 2018), nonexistent for public devs (Naukri), or deprecated for new developers (Indeed's Publisher API, shut down 2023). This app does not aggregate job listings — the user pastes in a job description manually, so none of that matters.
- No auto-apply, no scraping of any job board.
- No dependency on Claude Pro / claude.ai — the app calls the Anthropic API directly with its own key.

## 3. Where to build this

Project root: `C:\Users\Abhinav\OneDrive\Desktop\resume` (this exact folder — do not create a new top-level folder elsewhere). This folder already contains personal resume `.docx`/`.xlsx` files (e.g. `Abhinav_Giri_Goswami_Resume.docx`, `Job_Search_Tracker.xlsx`, several `Resume_<Company>_*.docx` files) — **do not move, edit, or delete any existing file in this folder.** Create the app's own subfolders (e.g. `/app`, `/src`, `/server`, `/public`) as needed; they'll sit alongside the existing files without conflict.

## 4. Tech stack (adjust if you have a better idea, but default to this for speed)

- **Framework:** Next.js (React + API routes in one project — simplest for a solo dev to run and deploy)
- **Styling:** Tailwind CSS
- **Database:** SQLite (via Prisma) — zero-config, fine for a single-user or small-scale free tool; easy to swap for Postgres later
- **AI:** Anthropic API (`@anthropic-ai/sdk`), model = Claude Sonnet for all scoring/tailoring/roadmap calls (best cost/quality balance for this workload; do not use Opus/Fable by default — too expensive for routine calls)
- **File parsing:** `pdf-parse` for PDF resumes, `mammoth` for `.docx` resumes
- **File generation:** `docx` (npm) for generating tailored resume downloads — keep output ATS-safe (see §7)
- **Auth:** keep minimal for MVP — a simple email-based session or even no-auth/local-only single-user mode is fine to start; don't over-build this before the core features work

Store the Anthropic API key in `.env.local` as `ANTHROPIC_API_KEY` — never hardcode it or commit it.

## 5. Core features (in build order)

### Phase 1 — Resume input
- User can **upload an existing resume** (PDF or DOCX) → parse to plain text.
- OR **build a resume from scratch** via a guided form (Contact Info, Summary, Skills, Experience, Projects, Certifications, Education) → store structured data, render to plain text for scoring and to DOCX for download.
- Either path produces one canonical "current resume" object per user session.

### Phase 2 — General ATS Score (always shown, no JD required)
Every resume gets a baseline ATS score out of 100, combining:
- **Formatting checks (rule-based, ~40% of score):** no tables/columns/text boxes/images, standard section headings present (Summary, Skills, Experience, Education), parseable contact info (email/phone detectable), consistent single font, no headers/footers holding critical text, reasonable length (1-2 pages).
- **Content quality (AI-scored via Claude, ~60% of score):** presence of quantified achievements, strong action verbs, clear job titles/dates, skill section coverage vs. the person's stated target role/industry, absence of vague filler language.
Show the score with a breakdown (not just a number) — list the specific issues found and how to fix each one.

### Phase 3 — Paste-a-job-description match score
- Textarea for the user to paste a job description.
- Compute a **JD-specific ATS match score**: keyword/skill overlap between resume and JD (exact + semantic matches via Claude — don't rely on naive string matching alone, JDs use synonyms), plus flag missing must-have requirements the JD lists explicitly.
- Show: match %, matched keywords, missing keywords/skills, and any experience-level mismatch (e.g. JD wants 5+ years, resume shows 2).
- After showing the score, **ask the user directly: "Want me to tailor your resume for this job?"** Only proceed to Phase 4 if they say yes — never auto-generate a tailored version without asking.

### Phase 4 — Tailored resume generation (on request only)
- Using the base resume + the pasted JD, generate an ATS-optimized tailored version: reorder/emphasize relevant bullets, naturally work in JD keywords the user's real experience supports, rewrite the summary to match the target role.
- **Never fabricate skills, tools, titles, or years of experience the user doesn't have.** If the tailored version can't truthfully claim something the JD wants, leave it out and note it as a gap instead.
- Output as a downloadable ATS-safe `.docx` (same formatting rules as Phase 2: no tables, single font, standard headings, no images).
- Show a short "what changed and why" summary alongside the download.

### Phase 5 — Skill gap roadmap
- From the Phase 3 gap analysis (skills/tools the JD wants that the resume doesn't show), generate a **structured learning roadmap** to close the gap and "crack" that specific job or role type:
  - Ordered list of skills/tools to learn, roughly prioritized by JD importance and learning difficulty.
  - For each: a rough time estimate (e.g. "2-3 weekends") and the *type* of resource to use (official docs, a specific well-known free course/certification if you're confident it's current and free, hands-on project idea to build proof of the skill) — don't invent course names or links that may not exist; when unsure, describe the resource type rather than naming a specific one.
  - End with 1-2 small project ideas the user could build/add to their resume to demonstrate the new skills.

## 6. Data model (rough starting point — refine as needed)

```
User        (id, email?, created_at)
Resume      (id, user_id, source: "uploaded" | "built", raw_text, structured_json, file_path, created_at)
JobDesc     (id, user_id, raw_text, parsed_requirements_json, created_at)
AtsReport   (id, resume_id, job_desc_id?, score, breakdown_json, created_at)   -- job_desc_id null = general score
Roadmap     (id, ats_report_id, steps_json, created_at)
```

## 7. ATS-safe formatting rules (apply to every generated resume, Phase 1 and Phase 4)

No tables, columns, text boxes, headers/footers holding body content, images/icons, or multiple fonts. Standard headings: Professional Summary, Core Skills, Professional Experience, Projects, Certifications, Education. Simple bullet points. Single font (e.g. Calibri or Arial), single column, standard margins.

## 8. Guardrails for the AI layer

- Every Claude API call that touches resume content must be instructed **never to invent experience, employers, titles, dates, or skills** — only reorganize, rephrase, and emphasize what's already true in the user's input.
- Be explicit in prompts to Claude about returning structured output (JSON) where the app needs to parse it (scores, keyword lists, roadmap steps) vs. free text where it's shown directly to the user.
- Log API errors gracefully — if the Anthropic API call fails, show a clear error, don't silently return a fake score.

## 9. Suggested build order for this session

1. Scaffold the Next.js + Tailwind + Prisma project in this folder.
2. Build resume upload + parse-to-text, and the build-from-scratch form, storing both to the DB.
3. Build the general ATS score (rule-based checks first, they don't need the API — get this working before wiring up Claude).
4. Wire up the Anthropic API for the content-quality half of the score.
5. Build the JD-paste flow and match scoring.
6. Add the "tailor my resume?" confirmation step and Phase 4 generation + DOCX download.
7. Add the Phase 5 roadmap generation.
8. Polish: basic auth/session if needed, error states, loading states.

Confirm the plan back to me before scaffolding if anything above is unclear or you'd choose a different stack — otherwise proceed phase by phase and show me working output after each phase rather than building everything silently end-to-end.

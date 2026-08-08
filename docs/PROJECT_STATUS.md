# Lumina — Project Status & Handoff

Read this whole file before making changes. It's the memory of everything built and decided across the last build session.

## What this is
**Lumina** — a free, open-source AI resume analyzer + job search platform. Landing page (marketing) at `/`, the working app at `/dashboard`. Built for Abhinav (job-hunting data engineer, Hyderabad). Plan: open-source first, maybe monetize later.

## Stack
- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind 4), Prisma 7 + SQLite, at the repo root.
- **Backend**: separate Python 3.13 FastAPI service in `backend/` — multi-source job search (Greenhouse/Ashby/Lever public ATS board APIs), resume-aware ranking, Postgres + Redis, Celery worker/beat for cache warming.
- **AI**: no Claude/OpenAI dependency by design — a local heuristic engine at `src/lib/ai/`, pluggable via an `AiEngine` interface + `AI_ENGINE` env var. (Tiered model discussed — local free / free-tier LLM / bring-your-own-key premium — **not built yet**.)

## How to run it
```powershell
# Docker (whole stack, simplest)
cd "C:\Users\Abhinav\OneDrive\Desktop\resume"
docker compose up -d              # http://localhost:3000
docker compose up -d --build      # after code changes
docker compose down               # stop

# Dev mode (hot reload, for active editing)
npm run dev                       # frontend, http://localhost:3000
cd backend && .\.venv\Scripts\activate && uvicorn app.main:app --reload   # optional backend, :8000

# Temporary public link (new random URL each run)
cloudflared tunnel --url http://localhost:3000
```
Node lives at `C:\Program Files\nodejs` — prepend to PATH in a fresh PowerShell if `npm`/`node` aren't found. Same idea for `docker`/`cloudflared` if "not recognized" — open a **new** terminal window.

## Job search
Legitimate public ATS board APIs only (Greenhouse/Ashby/Lever) — deliberately **not** scraping LinkedIn/Indeed/Naukri/Glassdoor (ToS/legal risk + would risk the user's own accounts, discussed and agreed). `src/app/api/jobs/search` proxies to the FastAPI backend when `JOBS_API_URL` is set in `.env.local`; otherwise it falls back to built-in TypeScript providers, so the app works even without the Python backend running.

**India relevance fix (done):** the old location filter did a naive substring match (`"india" not in "Bengaluru"`) with a leaky "remote" escape, so an India search returned ~1 India job + non-India leakage. Fixed by:
- `backend/app/utils/location.py` — India-aware matcher: city/state → country ("Bengaluru" counts as India), city spelling variants (Bangalore↔Bengaluru, Gurgaon↔Gurugram), and a worldwide-"Remote" listing no longer counts as an India match. Used by all 3 ATS adapters.
- Expanded `ats_boards` in `backend/app/core/config.py` with **verified-live India-hiring boards**: greenhouse:druva/postman/highradius/mongodb/rubrik, lever:meesho/cred/zeta/epifi. Verified live: "data engineer"/India now returns 30 relevant India roles, 0 leaks.
- After changing backend code: `docker compose up -d --build api` (the running container caches old code).

**Intelligent multi-query search (done):** the backend no longer searches one keyword. `backend/app/services/query_planner.py` analyzes the whole resume (skills via `extract_skills`, literal title mentions, seniority) against a weighted skills→roles map (~25 roles) and fans out up to 16 ranked role queries per search ("Data Engineer", "Power BI Developer", "Oracle ODI Developer"…). Board adapters (Greenhouse/Ashby/Lever) fetch each company board ONCE query-less and multi-query matching happens locally (free); aggregators get a budget of top queries (Adzuna 4, Jooble 2 — Jooble free tier is 500 requests TOTAL). Ranker weights jobs by their matched role's plan rank (`role_factor`) so a #16-role match can't outrank a #1-role match. New fields: `ScoredJob.matched_role`, `ScoredJob.match_reasons` (plain-language "why"), `JobSearchResponse.roles_searched` — all mapped through the Next proxy (`rolesSearched`, `matchedRole`, `matchReasons`) and rendered in JobSearchSection (role chips header + per-job reasons incl. "Boost this match by adding: X, Y").

**Adzuna + Jooble aggregators (ACTIVE):** `backend/app/crawler/adapters/adzuna.py` + `jooble.py`, auto-registered in `registry.py`, self-gate via `is_available()`. Keys live in the git-ignored root `.env` (`ADZUNA_APP_ID/KEY`, `ADZUNA_COUNTRY=in`, `JOOBLE_API_KEY`) and `docker-compose.yml` passes them to the `api` service via `${...}` interpolation. Verified live: Adzuna ~50 + Jooble ~20 India jobs per search, dominating the ranked top results (Warner Bros, eBay, ABB, MSD, Capco… — employers not on any ATS board). This is the Naukri/Indeed-style breadth, legally. Jooble free tier = 500 requests. External calls make first search ~4s; Redis cache (15-min TTL) makes repeats fast. To disable: blank the keys in `.env` and `docker compose up -d api`.

## Theming
Full CSS-variable token system in `src/app/globals.css` — two independent axes on `<html>`: `data-mode` (dark/light) and `data-accent` (violet/ocean/emerald/sunset). Components use token classes (`text-fg`, `bg-panel`, `text-primary`/`text-secondary`/`text-glow`, `text-muted`, `rgb(var(--primary-rgb))` etc.) — **never** hardcoded hex or `text-white`/`bg-white`. Switcher UI: `src/components/theme/ThemeSwitcher.tsx` (persists to localStorage, has a no-flash init script in `layout.tsx`).

**Known trap**: Tailwind's `@theme` block in `globals.css` must NOT be `@theme inline` — `inline` bakes color values in at build time so the switcher does nothing visually. Keep it as plain `@theme`.

## Cursor (went through several iterations — read before touching)
Two files: `src/components/cursor/SplashCursor.tsx` (the real WebGL fluid simulation, Navier-Stokes) and `src/components/cursor/CursorFX.tsx` (a small dot on top + a fallback 2D trail used only if WebGL fails).

**Resolved end state**: user wants the *real* fluid sim — like React Bits' "Splash Cursor" — rendered **over** the page content (not behind, not ultra-subtle), vivid enough to actually see, at `zIndex: 9998`. It's theme-accent colored, works on desktop (mouse) **and mobile** (touch-drag + scroll-velocity-driven splats, at a lower simulation resolution for phone GPUs). The small cursor dot sits on top at `z-9999`.

Tunable knobs are all in one `config` object near the top of `SplashCursor.tsx` (`DYE_INTENSITY` = density/brightness, `SPLAT_RADIUS` = area, `DENSITY_DISSIPATION` = fade speed, `SPLAT_FORCE` = spread, `VELOCITY_DISSIPATION` = how much it clings to the cursor, `CURL` = swirliness). The smoke direction is intentionally reversed — trails **opposite** the cursor's movement (two minus signs on `pointer.dx`/`pointer.dy` in the splat call inside the animation loop — remove them to make it lead instead of trail).

**If asked to change the cursor again**: don't guess — the fastest test loop is `npm run dev` (hot reload, no Docker rebuild needed) and eyeball it live before committing to a value.

## Resume Studio: AI Interview + manual builder
`src/components/dashboard/ResumeStudio.tsx` wraps two modes (Dashboard renders it where BuilderSection used to be): the **AI Resume Interview** (default — `InterviewSection.tsx`, a chat that asks recruiter-style questions one at a time with skip/back, suggestion chips, typing/streaming animations) and the classic manual form (`BuilderSection.tsx`). Interview flow lives in `src/lib/interview/script.ts` (pure state machine). On finish it runs `/api/ai/polish-resume`, saves via `/api/resume/build`, scores with `LocalAiEngine.analyzeResume` client-side, and generates a cover letter + LinkedIn summary (`src/lib/interview/careerDocs.ts`, template-based).

**Tiered AI (BUILT — needs a free key to go live):** `src/lib/ai/llmClient.ts` is a server-only client for free-tier LLMs — Groq `llama-3.3-70b` (GROQ_API_KEY, console.groq.com) or Gemini flash (GEMINI_API_KEY, aistudio.google.com/apikey). `AI_ENGINE=auto` (default) uses the LLM when a key exists, local rules otherwise; `local` forces offline. Two routes consume it, both with verified local fallback: `/api/ai/enhance` (batch bullet/summary rewriting — interview answers go through this) and `/api/ai/polish-resume` (whole-resume cleanup at interview finish: fixes casing/typos like "deloitte | assocaite analyst", distills pasted-blob summaries into 2-3 sentences, strengthens bullets; output is schema-validated + identity-checked before use, falls back to input). Keys go in the git-ignored root `.env` (docker) / `.env.local` (dev), then `docker compose up -d web` (env-only change, no --build needed). PRIVACY: with a key set, resume text IS sent to the provider — the landing page's "never leaves this machine" claim needs updating if this ships beyond personal use. The pure-local fallback enhancer is `src/lib/interview/enhance.ts` (verb upgrades incl. present-tense, tech enrichment, impact clauses).

**Quality of AI output (learned the hard way):** output is only as good as the input — the model is (correctly) forbidden from inventing metrics, so thin interview answers → generic bullets. Fixes in place: (1) `src/lib/ai/skillCasing.ts` deterministically fixes acronym/product casing the LLM gets wrong ("Power Bi"→"Power BI", "Etl"→"ETL", "Dax"→"DAX") — applied to enhance + polish output AND the interview skills step, never trust the model for casing; (2) enhance + polish prompts ban generic filler ("results-driven", "proven ability", "leverage", "utilize"…) and now DEMAND every concrete detail/number/named-system be PRESERVED not compressed (an earlier "12-24 words" cap was silently dropping "500+ PVOs", "1M+ rows", "Medallion architecture" — fixed); (3) interview bullet question explicitly asks for numbers/scope. RECOMMENDATION for a user with an existing detailed resume: uploading it beats re-typing thin interview answers (uploaded resumes are NOT yet auto-polished — a "Polish with AI" pass on the upload/parse path is the obvious next feature).

**Polish with AI on uploads (BUILT):** `PolishResumeCard.tsx` sits under the Resume preview (Dashboard). `POST /api/resume/[resumeId]/polish` → shared lib `src/lib/ai/polishResume.ts`. Two functions: `polishStructuredResume` (strict — keeps structure, used by the interview finish + built resumes) and `structureResumeFromText` (for uploads — sends the RAW TEXT to the LLM which parses + restructures + polishes in one step, far better than the heuristic `parseRawToStructured` at splitting jumbled sections; identity-guarded by requiring the output email to match the source email). `normalizeCasing` also drops empty entries (the model echoes the empty-template shape from the prompt → blank projects/certs that render as lone bullets). Verified live: a mangled upload (all jobs jammed in summary) → 3-4 correctly-split job entries, all metrics preserved, clean PDF. NOTE minor LLM variance: thin bullets can get spun into thin "projects", and it occasionally uses a banned word ("utilizing") — acceptable, the rich content is excellent.

**Interview guard:** users paste their ENTIRE old resume into the "tell me about yourself" question (happened in real use — giant blob became the summary). `script.ts` detects it (>500 chars or date ranges) and skips storing it as summary; the polish pass writes the real summary at the end.

**Builder input gotcha (fixed, don't reintroduce):** comma-separated fields must NOT do `value={items.join(", ")}` + parse-on-change — that destroys the comma/space you just typed on re-render. Use the `ListArea` component in BuilderSection.tsx (raw local state while focused, parse on change, normalize on blur).

## Text sanitization (mojibake fix)
`src/lib/textSanitize.ts` — PDF extraction leaves PUA glyphs (U+F0B7 Wingdings bullets), ligatures, smart quotes, zero-width chars that mangle downstream (pdfkit WinAnsi → "%Ï"FP…" garbage; missed section headings in the parser). Applied at: upload (`/api/resume/upload` sanitizes rawText), download (`buildResumeDownload` deep-sanitizes the structured resume), and PDF render (`toWinAnsi` drops anything WinAnsi can't encode). `parseRawToStructured` also got: heading detection that tolerates leading bullets + more heading synonyms + a rescue that moves date-range blocks out of summary into experience when the experience heading was missed.

## Resume downloads (PDF + DOCX)
Both the saved-resume route (`/api/resume/[resumeId]/download`) and the tailored-resume route (`/api/resume/tailor/[tailoredId]/download`) take `?format=pdf|docx` (default docx), plus `?template=modern|classic` and `?accent=violet|ocean|emerald|sunset|slate` for the PDF. Shared helper `src/lib/resumeDownload.ts` deep-sanitizes then picks the generator: `generateResumeDocx` (docx lib) or `generateResumePdf` (**pdfkit**, `src/lib/generatePdf.ts` — redesigned: display name, accent letterspaced headings over hairlines, right-aligned dates, accent bullets, italic summary; ATS-safe single column). pdfkit is in `serverExternalPackages` (next.config.ts) because it loads AFM font-metric files from node_modules at runtime. Both generators strip leading bullet chars from bullet text (they draw their own). Both PDF + DOCX buttons are wired in the job-search tailor panel, AnalysisSection, and BuilderSection. The Builder also still has a "Print view" (`/print`) for browser print-to-PDF. Verified live: PDF renders a clean professional resume; DOCX opens in Word.

**Job-search resume tailoring:** each job card has a "Tailor resume" button (needs an uploaded resume). It POSTs `{ resumeId, jdText }` to `/api/resume/tailor` — that route now accepts raw `jdText` (persists a JobDesc on the fly) in addition to an existing `jobDescId`. Result panel shows changes/gaps + PDF/DOCX download inline.

## Known gotchas (already fixed, don't reintroduce)
- **`Dockerfile.web`**: must NOT set `NODE_ENV=production` before `npm ci` — that skips devDependencies (Tailwind, TypeScript) and breaks the build.
- **`next.config.ts`**: needs `serverExternalPackages: ["pdf-parse", "pdfjs-dist"]` or PDF resume uploads throw a "worker not found" error in production builds.
- **PowerShell 5.1** `Get-Content`/`-replace` on UTF-8 files corrupts special characters (em-dashes, `·`) into mojibake. Use `[System.IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)` + `WriteAllText` with a no-BOM UTF8 encoding instead.
- This machine had **no Node, Python, or Docker** initially — all installed via `winget` mid-project (Node 24 LTS, Python 3.13, Docker Desktop 4.81 + WSL2/Ubuntu). If a fresh environment is missing a tool, that's why — reinstall the same way.

## Discussed but NOT built yet (candidates for next session)
- Application tracking dashboard (Saved → Applied → Interviewing → Offer pipeline).
- Tiered AI (local free / free-tier LLM APIs like Groq or Gemini / bring-your-own Claude-GPT key for premium).
- Guided-vs-auto resume tailoring (a free-text "emphasize X" prompt alongside the automatic tailor).
- Optional local LLM via Ollama.
- Get free Adzuna/Jooble keys to switch the (already-built) aggregator adapters on for India-wide breadth — see the Job search section.

## Style/collaboration notes from this session
- User wants things **verified live**, not just "should work" — run it, check it, then report.
- User iterates a lot on visual/feel things (cursor, themes) — expect back-and-forth; the fastest path is showing a quick change rather than over-explaining first.
- Be upfront about tradeoffs before building (e.g., flagged the WebGL-fluid-vs-particles tradeoff, the Docker-needs-reboot issue, the scraping-vs-legit-API legal issue) — this was explicitly appreciated.

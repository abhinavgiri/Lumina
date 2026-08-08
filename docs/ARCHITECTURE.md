# Lumina — Architecture

> AI resume analyzer + intelligent job search. Free, open-source-ready, privacy-first by default.
> Landing page at `/`, working app at `/dashboard`.

---

## 1. System overview

```mermaid
flowchart TB
    subgraph Client["🌐 Browser"]
        UI["Next.js UI<br/>Dashboard · AI Interview · Job Search<br/>Tailwind 4 · Framer Motion · WebGL cursor"]
    end

    subgraph Web["🖥️ web container — Next.js 16 (Node 20)"]
        API_ROUTES["API Routes<br/>/api/resume/* · /api/analyze<br/>/api/jobs/search · /api/ai/*"]
        LOCAL_AI["Local AI Engine<br/>src/lib/ai/localEngine.ts<br/>ATS scoring · skill extraction · JD match"]
        LLM_CLIENT["LLM Client (server-only)<br/>src/lib/ai/llmClient.ts<br/>AI_ENGINE=auto"]
        EXPORTS["Exports<br/>pdfkit (PDF) · docx (DOCX)<br/>3-layer text sanitization"]
        SQLITE[("SQLite (Prisma 7)<br/>users · resumes · tailored<br/>analyses · job descs")]
    end

    subgraph Api["🐍 api container — FastAPI (Python 3.13)"]
        SEARCH["Search Orchestrator<br/>query planner → fan-out →<br/>merge → dedupe → rank"]
        ADAPTERS["Source Adapters<br/>Greenhouse · Ashby · Lever<br/>Adzuna · Jooble"]
        RANKER["Explainable Ranker<br/>8 weighted signals<br/>+ match reasons"]
        PG[("Postgres 16<br/>saved jobs · search history<br/>crawl logs")]
        REDIS[("Redis 7<br/>15-min search cache")]
    end

    subgraph Workers["⚙️ worker + beat containers"]
        CELERY["Celery<br/>scheduled cache warming"]
    end

    subgraph External["☁️ External APIs"]
        ATS["Public ATS boards<br/>Greenhouse · Ashby · Lever<br/>(no auth, no scraping)"]
        AGG["Aggregators<br/>Adzuna · Jooble<br/>(free API keys)"]
        GROQ["Groq / Gemini<br/>free-tier LLM<br/>(optional key)"]
    end

    UI -->|"fetch"| API_ROUTES
    API_ROUTES --> LOCAL_AI
    API_ROUTES --> LLM_CLIENT
    API_ROUTES --> EXPORTS
    API_ROUTES --> SQLITE
    API_ROUTES -->|"JOBS_API_URL<br/>(fallback: built-in TS providers)"| SEARCH
    LLM_CLIENT -->|"HTTPS"| GROQ
    SEARCH --> ADAPTERS
    SEARCH --> RANKER
    SEARCH --> REDIS
    SEARCH --> PG
    ADAPTERS -->|"HTTPS"| ATS
    ADAPTERS -->|"HTTPS"| AGG
    CELERY --> REDIS
```

**Six Docker containers** (`docker-compose.yml`): `web`, `api`, `postgres`, `redis`, `worker`, `beat`.
Public sharing via Cloudflare quick tunnels (`cloudflared tunnel --url http://localhost:3000`) — one-click `.bat` launchers in the repo root.

---

## 2. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 16 (App Router, TS), Tailwind 4, Framer Motion, Lucide | Token-based theming: `data-mode` × `data-accent` on `<html>` |
| Frontend DB | Prisma 7 + SQLite (`webdata` volume) | Zero-infra default; swap `DATABASE_URL` for Postgres in prod |
| Job-search backend | FastAPI, SQLAlchemy async, Pydantic v2 | Separate service in `backend/` |
| Backend DB | Postgres 16 (asyncpg) | Saved jobs, search history, crawl logs |
| Cache | Redis 7, 15-min TTL | Graceful no-op degradation if down |
| Queue | Celery worker + beat | Scheduled cache warming |
| HTTP client | httpx + tenacity retries | UA rotation, pooling, timeouts |
| AI tier 1 | Local heuristic engine (pure TS) | Always available, fully offline |
| AI tier 2 | Groq `llama-3.3-70b` / Gemini flash | `AI_ENGINE=auto`, server-only keys |
| PDF export | pdfkit (WinAnsi-safe) | Modern/classic templates, accent colors |
| DOCX export | docx | Mirrors PDF layout |
| Effects | Custom WebGL Navier-Stokes fluid cursor | `SplashCursor.tsx`, theme-accent colored |

---

## 3. Flow: intelligent job search

The core innovation — **resume → multi-query fan-out**, not single-keyword search.

```mermaid
sequenceDiagram
    participant U as User
    participant W as Next.js /api/jobs/search
    participant F as FastAPI /jobs/search
    participant QP as Query Planner
    participant B as ATS Boards (×16)
    participant A as Aggregators (Adzuna/Jooble)
    participant R as Ranker

    U->>W: search (resumeId, location)
    W->>W: load resume text (SQLite)
    W->>F: title + location + resume_text
    F->>QP: plan_queries(resume)
    QP-->>F: up to 16 ranked role queries<br/>(skills→roles map + title mentions)
    par Boards: fetch once, match locally
        F->>B: full board fetch (query-less, cached)
        B-->>F: postings (location-filtered)
        F->>F: best_query_match() per job<br/>drop non-matching
    and Aggregators: budgeted real queries
        F->>A: top queries (Adzuna 4, Jooble 2)
        A-->>F: postings tagged with originating role
    end
    F->>F: merge → dedupe → filters
    F->>R: rank (title, skills, freshness,<br/>role-plan-order factor…)
    R-->>F: scored jobs + match_reasons
    F-->>W: jobs + roles_searched
    W-->>U: ranked cards: score, matched role,<br/>"why this matches", missing-skill hints
```

Resilience: per-source **circuit breakers**, Redis caching per (source, query, location), and if the FastAPI backend is down entirely, the Next.js route **falls back to built-in TypeScript providers** so search never hard-fails.

---

## 4. Flow: resume upload → AI polish → export

```mermaid
flowchart LR
    A["📄 Upload<br/>PDF / DOCX"] --> B["parse<br/>pdf-parse / mammoth"]
    B --> C["sanitize text<br/>PUA glyphs · ligatures ·<br/>zero-width chars"]
    C --> D[("save<br/>SQLite")]
    D --> E{"Polish with AI?"}
    E -->|"yes"| F["structureResumeFromText<br/>LLM parses + restructures +<br/>rewrites from RAW TEXT"]
    F --> G["guards:<br/>schema validation ·<br/>email identity check ·<br/>casing normalizer ·<br/>empty-entry filter"]
    G --> D2[("save polished<br/>structuredJson")]
    E -->|"no key"| H["heuristic parser<br/>parseRawToStructured"]
    H --> G
    D2 --> I["⬇ Export"]
    I --> J["PDF (pdfkit)<br/>modern/classic template"]
    I --> K["DOCX (docx)"]
```

**Sanitization is 3-layer** (mojibake was a recurring bug class): at upload, at download (`sanitizeDeep`), and at PDF render (`toWinAnsi` drops anything WinAnsi can't encode).

---

## 5. Flow: AI Resume Interview

```mermaid
flowchart TD
    S["👋 Chat interview starts<br/>(state machine: src/lib/interview/script.ts)"] --> Q["Ask one question<br/>name → contact → role → summary →<br/>jobs (loop) → projects → skills →<br/>education → certs"]
    Q --> AN["User answers<br/>(skip / back / suggestion chips)"]
    AN --> EN["/api/ai/enhance<br/>LLM rewrite (Groq) or local rules"]
    EN --> CH{"Improved?"}
    CH -->|"yes"| P["'Use polished ✨ / Keep mine'"]
    CH -->|"no"| Q
    P --> Q
    Q -->|"done"| POL["/api/ai/polish-resume<br/>whole-resume pass: casing, typos,<br/>summary distillation"]
    POL --> SAVE["save via /api/resume/build"]
    SAVE --> OUT["🎉 Outputs:<br/>ATS score · PDF/DOCX ·<br/>Cover letter · LinkedIn summary ·<br/>improvement tips"]
```

Guard: if the user pastes their **entire old resume** into the summary question (>500 chars or contains date ranges), it's absorbed as context instead of stored as the summary — the polish pass writes a real 2-3 sentence summary at the end.

---

## 6. AI engine — tiered, pluggable, guarded

```mermaid
flowchart LR
    REQ["AI request<br/>(enhance / polish / structure)"] --> SEL{"AI_ENGINE?"}
    SEL -->|"auto + GROQ_API_KEY"| G["Groq llama-3.3-70b"]
    SEL -->|"auto + GEMINI_API_KEY"| M["Gemini flash"]
    SEL -->|"local / no key / LLM fails"| L["Local heuristic rules<br/>verb map · tech enrichment ·<br/>impact clauses"]
    G --> V["Output guards"]
    M --> V
    V --> V1["Zod schema validation"]
    V1 --> V2["identity check<br/>(email must match)"]
    V2 --> V3["deterministic casing<br/>normalizer (Power BI, ETL, DAX…)"]
    V3 --> V4["empty-entry filter"]
    V4 --> OK["✅ response"]
    V -->|"any guard fails"| L
    L --> OK
```

Principles enforced in every prompt:
- **Never invent** employers, dates, tools, or numeric metrics.
- **Preserve every real detail** (numbers, named systems, architectures) — compressing them away is a failure.
- **Banned filler**: "results-driven", "proven ability", "leverage", "utilize", "team player", …
- Casing is **never trusted to the model** — normalized deterministically after.

Privacy: with no LLM key, everything is fully offline. With a key, resume text is sent to Groq/Google **only** for the AI-writing features (explicit opt-in by configuring the key).

---

## 7. Data model (frontend SQLite, Prisma)

```mermaid
erDiagram
    User ||--o{ Resume : has
    User ||--o{ JobDesc : has
    Resume ||--o{ AtsReport : analyzed
    JobDesc ||--o{ AtsReport : against
    Resume ||--o{ TailoredResume : tailored
    JobDesc ||--o{ TailoredResume : for

    Resume {
        string id PK
        string source "uploaded | built"
        string rawText
        string structuredJson "nullable"
    }
    JobDesc {
        string id PK
        string rawText
    }
    TailoredResume {
        string id PK
        string structuredJson
        string changesJson
        string gapsJson
    }
```

Backend Postgres holds: `saved_jobs`, `search_history`, `crawler_logs` (keyed by client id).

---

## 8. Key directories

```
resume/
├─ src/
│  ├─ app/api/            # Next.js API routes (resume, analyze, jobs, ai/*)
│  ├─ components/dashboard/  # Dashboard, InterviewSection, JobSearchSection,
│  │                          # ResumeStudio, BuilderSection, PolishResumeCard
│  ├─ components/cursor/   # SplashCursor (WebGL fluid) + CursorFX
│  ├─ lib/ai/              # localEngine, llmClient, polishResume, skillCasing
│  ├─ lib/interview/       # script (state machine), enhance, careerDocs
│  ├─ lib/jobs/            # TS fallback providers
│  └─ lib/                 # generatePdf, generateDocx, textSanitize, resumeDownload
├─ backend/app/
│  ├─ api/                 # routes + rate limiting deps
│  ├─ crawler/adapters/    # greenhouse, ashby, lever, adzuna, jooble
│  ├─ services/            # search_service, query_planner, filters
│  ├─ ranking/             # ranker, dedupe
│  ├─ cache/  scheduler/  utils/  database/
├─ docker-compose.yml      # 6 services
├─ Dockerfile.web  backend/Dockerfile
└─ PROJECT_STATUS.md       # living handoff doc (read first!)
```

---

## 9. Resilience & security patterns

| Pattern | Where |
|---|---|
| Graceful degradation | Backend down → TS providers; Redis down → no-op cache; no LLM key → local rules; invalid LLM output → original returned |
| Circuit breakers | Per job-source, N failures → cooldown skip |
| Rate limiting | Sliding window per client (in-memory — move to Redis before multi-replica) |
| Aggregator budgets | Adzuna 4 queries/search, Jooble 2 (500-request free tier) |
| Secrets | Git-ignored `.env`, server-only LLM client, compose `${VAR:-}` interpolation |
| Input sanitization | 3-layer text cleanup (upload/download/render) |
| LLM output guards | Zod schema + identity check + casing normalizer + empty-entry filter |

### Known gaps (deliberate, documented for scale-up)
- Rate limiter is in-memory (single instance only) — needs Redis token bucket for replicas
- Upload validates file extension only — magic-byte (MIME) verification recommended
- No `restart:` policies in compose; no cache-stampede protection (TTL jitter/locks)
- SQLite for user data — migrate to managed Postgres before multi-user
```

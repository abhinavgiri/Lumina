# Where everything lives

A map rather than a reshuffle. **`src/` is deliberately not moved**: Next.js App
Router requires `src/app`, and relocating it would break routing, the `@/*`
tsconfig alias, ~100 imports, the Docker `COPY` paths, and the vitest/Playwright
configs — a lot of risk for a cosmetic gain. The code is already separated by
domain; this document is the missing signpost.

```
resume/
├── src/                    FRONTEND + server-side app code (Next.js)
├── backend/                PYTHON job-search service + the ML engine
├── shared/                 Single source of truth for skills & roles (JSON)
├── prisma/                 Database schema + migrations
├── e2e/                    Playwright end-to-end journeys
├── scripts/                One-off + build tooling
├── docs/                   Documentation and the roadmap tracker
├── samples/                Example resumes (test fixtures, real documents)
└── <root>                  Deployment + config
```

---

## Frontend & app server — `src/`

| Path | What it is |
|---|---|
| `src/app/` | Routes. `page.tsx` = landing, `dashboard/` = the app, `api/**/route.ts` = HTTP endpoints (thin adapters only) |
| `src/components/` | React components — `dashboard/`, `landing/`, `auth/`, `fx/`, `cursor/`, `theme/` |
| `src/server/services/` | **Business logic.** resume, analysis, tailor, job, ai, application, analytics, careerProfile, rewrite |
| `src/lib/api/` | The API contract: `response.ts` (server envelope) and `client.ts` (client unwrapping) |
| `src/lib/client/lumina.ts` | Typed SDK — the only place the browser knows API URLs |
| `src/lib/ai/` | Local heuristic engine, LLM client, AI mode/consent, skill casing |
| `src/lib/ats/` | The deterministic 9-category ATS engine |
| `src/lib/resume/` | Resume intelligence, rewrite validation, PDF template registry |
| `src/hooks/` | React hooks holding orchestration (e.g. `useResumeAnalysis`) |
| `src/generated/prisma/` | **Generated** — never edit |

**The rule that keeps this clean:** routes stay thin, services hold logic,
components render. If a route has business logic in it, it's in the wrong place.

## Python backend — `backend/`

| Path | What it is |
|---|---|
| `backend/app/crawler/adapters/` | One file per job source (Greenhouse, Lever, Ashby, Adzuna, Jooble) |
| `backend/app/services/` | `search_service.py` (orchestrator), `query_planner.py` (resume → role queries) |
| `backend/app/ranking/` | Explainable weighted ranking + dedupe |
| `backend/app/utils/skills_data.py` | **Generated** from `shared/` — never edit |
| `backend/tests/` | pytest suite |

## AI / ML engine — `backend/ml/`

| Path | What it is |
|---|---|
| `synth_resumes.py` | Generates labelled synthetic training resumes |
| `train_role_classifier.py` | Trains the role classifier → `models/role_clf.joblib` |
| `embed_index.py` | Sentence-transformer embeddings + FAISS semantic search |
| `infer.py` | `predict_role()` — the app's entry point (falls back silently if absent) |
| `pii.py` | Strips PII before any training or indexing |
| `validate_external.py` | Scores the model against an independent dataset |
| `DATA_PROVENANCE.md` | Where every training dataset came from and its licence |

Requires `requirements-ml.txt` (installed in `backend/.venv`, **not** in Docker).

## Shared vocabulary — `shared/`

`skills.json` and `roles.json` are canonical. Both stacks are **generated** from
them by `npm run gen:shared`. Edit the JSON, never the generated files — they
drifted to 104-vs-77 skills once and broke job matching.

## Deployment — root

| File | Purpose |
|---|---|
| `Lumina - Deploy Local.bat` | Local production deploy (migrate → build → start) |
| `Lumina - Run Local.bat` | Development server |
| `Dockerfile.web` / `docker-compose.yml` | Full stack: web + api + postgres + redis + worker |
| `docs/DEPLOY_LOCAL.md` | How to run it, and what degrades if optional pieces are missing |

Kept at root on purpose — Docker and the `.bat` files resolve paths relative to
the project root, so moving them would break them.

---

## Running a Sonar scan

`sonar-project.properties` is configured. Then:

```bash
sonar-scanner
```

**What's excluded and why it matters:** generated code (`src/generated`,
`skills_data.py`, `skillsData.ts`, `prisma/migrations`), vendored dependencies
(`node_modules`, `.venv`), ML data and model binaries, and `samples/` — those
are real resume documents containing personal data and shouldn't be uploaded to
an analysis service.

For coverage, generate the reports first:

```bash
npm test -- --coverage
cd backend && pytest --cov=app --cov-report=xml
```

# Lumina V2 — Step 1: Refactoring Report (review only, no code changed)

Grounded in a read of the actual code, not the status docs. Cites real files.
Purpose: name the technical debt, the duplicated logic, and the architecture
violations *before* any V2 phase starts — and sequence the work so the
highest-risk-lowest-value parts don't sink a solo build.

---

## TL;DR

- **The backend is already ~70% of the "clean architecture" the plan wants.** SOLID
  adapter pattern, circuit breakers, an orchestrator service, separated
  ranker/dedupe/filters, structured logging. Don't rebuild it — extend it.
- **The debt is almost entirely on the frontend / Next side:** business logic
  lives in React components and in API route handlers, there's no service layer,
  and API responses aren't standardized.
- **The deepest structural problem is a *forked brain*:** resume-skill extraction,
  role planning, and ranking exist in BOTH TypeScript (`localEngine.ts`) and Python
  (`query_planner.py`, `ranker.py`, `utils/text.py`), with a **duplicated skills
  dictionary in two languages**. This will rot. Pick one owner.
- **Testing is near-zero** (1 backend test, 0 frontend). Nothing can be safely
  refactored until current behavior is pinned.
- **Two plan phases contradict each other** (Phase 4 "ML-predict the ATS score" vs
  Phase 6 "ATS is completely deterministic, no ML"). Resolve in favor of Phase 6.

---

## A. What's already good — protect it, don't rebuild

| Area | File(s) | Why it's good |
|---|---|---|
| Job-source extensibility | `backend/app/crawler/base.py` | Textbook SOLID: `SourceAdapter` ABC, `is_available()` gating, circuit-breaker-wrapped `search()`. New sources need zero changes elsewhere. |
| Search orchestration | `backend/app/services/search_service.py` | Real pipeline already: plan → fan-out → merge → dedupe → filter → rank, with per-source status + crawl logs. This IS the Phase 5 shape. |
| Explainable ranking | `backend/app/ranking/ranker.py` | Transparent weighted signals + `role_factor`, deliberately swappable for a learned ranker. Matches the plan's principles. |
| AI tiering seam | `src/lib/ai/index.ts`, `llmClient.ts`, `localEngine.ts` | The `AiEngine` interface + local→LLM fallback with schema+identity validation is the Tier 1/2/3 skeleton the plan asks for. |
| Download choke point | `src/lib/resumeDownload.ts` | Single sanitize-then-render path shared by both download routes. Good — not duplicated. |

**Implication:** Phase 1's "reliable backend / service layers / adapters" is mostly
done *in Python*. The gap is that the **Next app never got the same treatment.**

---

## B. Architecture violations (ranked by leverage)

### B1. Business logic inside React components — **highest priority**
`src/components/dashboard/Dashboard.tsx` (355 lines) owns orchestration that isn't UI:
- `fetch("/api/analyze")` + response shaping (lines 76–98)
- staged fake-progress timers + a hard-coded **2800 ms artificial `minDelay`** (73–83)
- history-array mutation and `.slice(0,6)` business rule (87–96)
- imperative scroll side-effects (98, 112)

This is the direct violation of the plan's *"move business logic out of React
components."* There is **no client-side service layer** — every component talks to
`fetch` directly.

**Fix (Phase 1/2):** introduce a client SDK (`src/lib/client/analysisClient.ts`,
`resumeClient.ts`, `jobClient.ts`) + hooks (`useAnalysis`). Components render state,
they don't orchestrate requests. Move the artificial delay/staging into the view layer.

### B2. Business logic inside API route handlers
`src/app/api/analyze/route.ts` and `.../resume/tailor/route.ts` inline, in the HTTP
handler: auth → DB fetch → JSON-blob parse → AI call → **multi-entity persistence**
(`Resume` + `JobDesc` + `AtsReport`, or `TailoredResume`). There is no server
service layer — exactly the Resume/ATS/Analytics services the plan wants.

**Fix:** server services (`server/services/analysisService.ts` etc.) hold the flow;
routes become thin HTTP adapters that call a service and format the envelope.

### B3. Non-standardized API responses + inconsistent error handling
- `analyze/route.ts` wraps everything in try/catch and returns `{error}` on failure.
- `resume/tailor/route.ts` has **no top-level try/catch** — `getOrCreateUserId()` or
  `req.json()` throwing yields an unshaped 500. Only the AI call is guarded.
- Success shapes are ad hoc (`{atsReportId, analysis, engine}` vs `{tailoredResumeId,
  resume, changes, gaps}`).

**Fix:** one envelope (`{ ok: true, data }` / `{ ok: false, error }`) + a
`withApi(handler)` wrapper that does auth, uniform error mapping, and logging once.

### B4. The forked brain — **deepest structural debt**
Resume intelligence is implemented **twice, in two languages**:
- TS: `src/lib/ai/localEngine.ts` (`findSkills`, `suggestJobQuery`, JD matching) +
  its skills data in `src/lib/ai/skillsData.ts`.
- Python: `backend/app/services/query_planner.py`, `ranking/ranker.py`,
  `utils/text.py` (`extract_skills`) — with **its own skills dictionary**.

Two skill dictionaries, two ranking notions, two "what role is this" heuristics that
must be kept in sync by hand. Every Phase 3/4/5 improvement doubles unless this is
resolved.

**Fix (decide the boundary):** Python owns *all* resume/job intelligence (it's also
where spaCy / embeddings / FAISS from Phase 4 naturally live); the Next app calls it
and keeps only a thin offline fallback. Single source of truth for the skills
dictionary (one file, generated/consumed by both if TS-offline must stay).

### B5. JSON-blob-as-string persistence
`resume.structuredJson` is a stringified blob that gets `JSON.parse`d inline all over
(`analyze/route.ts:22-28`, `tailor/route.ts:38-42`). No typed columns, no query-ability,
no migration path toward the Phase 9 Career Profile. Correctly a *later* phase, but
flag it: this pattern is debt that compounds.

### B6. Overlapping "parse" concepts, no explicit pipeline
Three parse paths with confusable names/roles:
- `src/lib/parseResume.ts` — file → raw text (extraction)
- `localEngine.ts:parseRawToStructured` — heuristic text → structure
- `polishResume.ts:structureResumeFromText` — LLM text → structure

Phase 3 wants explicit stages (Parser → Normalizer → Entity Extraction → …). Today
they're scattered across three files with implicit ordering.

### B7. No dependency injection / everything is a module singleton
`getAiEngine()`, `prisma`, backend `cache`/`breakers` are all module globals reading
env at import. The *seams* exist (`AiEngine`, `SourceAdapter`) but wiring is
hard-coded, which is why tests are hard to write. The plan's "DI where appropriate"
is mostly about making these injectable for testing.

### B8. Near-zero test coverage — **blocks everything else**
`backend/tests/test_ranking.py` is the only test; the frontend has none. You cannot
safely refactor the intelligence layer without a net.

**Fix (do this FIRST, before B1–B6):** characterization tests that pin *current*
behavior — golden resume text → current ATS subscores, current `plan_queries` output,
current `rank_jobs` order. Then refactor green.

---

## C. Correctness / trust issues (not just structure)

- **Privacy claim contradiction (must-fix before any hosted deploy).** The landing
  page and dashboard footer say *"your resume never leaves this device,"* but Tier 2
  (`llmClient.ts`) sends full resume text to Groq/Gemini once a key is set. Fine for
  personal/local use; a trust bug the moment it's hosted or shared. Make the claim
  conditional on the active tier.
- **Anonymous-cookie identity** (`src/lib/session.ts`) auto-creates a user with no
  auth. Fine for a local tool; a hard blocker for the multi-user Career Profile,
  analytics history, and anything monetizable. Real auth is a prerequisite for
  Phases 7–9, not an afterthought.

---

## D. Honest pushback on the V2 plan (sequencing & scope)

**Keep — these are right:**
- The development principles (deterministic over LLM; LLM only for language;
  never invent facts; testable modules). Already partly embodied — make them law.
- Tier 1/2/3 AI split. Phase 6 deterministic ATS. Phase 9 Career Profile spine.
- Embeddings + FAISS semantic job match (Phase 4/5) — unsupervised, no labels
  needed, a real win over keyword matching.

**Cut or defer — these are traps for a solo builder:**
- **Phase 4 supervised ML (XGBoost/CatBoost to "predict ATS score / resume
  quality").** No training dataset exists, and there is no ground-truth ATS score to
  train against — you'd be training a model to imitate your own heuristic (circular).
  It also *contradicts* Phase 6 ("ATS is completely deterministic, no ML"). Resolve:
  **keep ATS deterministic, drop the resume-quality regressor.** Keep only the
  unsupervised pieces (spaCy skill NER, sentence-transformer embeddings, FAISS).
- **Phase 5 hostile connectors (Workday, Oracle, SuccessFactors, BambooHR).** Unlike
  Greenhouse/Lever/Ashby/SmartRecruiters, these have **no clean public board API** —
  per-tenant, auth-gated, bot-protected; "crawl Fortune 500, respect robots.txt" will
  mostly return *disallowed*. This is where solo projects burn months for little yield.
  **Add SmartRecruiters next (easy public API); treat Workday/Oracle as official-feed-
  only maybes, not committed connectors.**
- **12 phases is a company-years roadmap.** The plan's own "module by module" is
  right; the trap is treating all 12 as committed.

**Recommended sequence given what already exists:**
1. **B8 first** — characterization tests (the net).
2. **B1–B3** — frontend service layer + response envelope (the actual debt).
3. **B4** — unfork the brain (Python owns intelligence; one skills dictionary).
4. **Embeddings + FAISS** semantic search (achievable, high-value).
5. **Auth + Career Profile schema** (unblocks dashboard/analytics).
6. **Dashboard/analytics** last — it's the reward, not the foundation.

Defer: supervised ML models, hostile ATS connectors.

---

## E. Debt inventory (quick reference)

| # | Debt | File(s) | Phase it blocks | Effort |
|---|---|---|---|---|
| B1 | Logic in components | `Dashboard.tsx` | 1, 10 | M |
| B2 | Logic in route handlers | `api/analyze`, `api/resume/tailor` | 1, 3 | M |
| B3 | Non-standard responses / error gaps | all `api/*/route.ts` | 3 | S |
| B4 | Forked skill/rank logic across TS+Py | `localEngine.ts` ↔ `query_planner.py`/`ranker.py`/`utils/text.py` | 2, 4, 5 | L |
| B5 | JSON-string persistence | `schema.prisma`, `api/*` | 9 | L |
| B6 | Scattered parse stages | `parseResume.ts`, `localEngine.ts`, `polishResume.ts` | 3 | M |
| B7 | Module-singleton wiring / no DI | `lib/ai/index.ts`, `lib/db.ts` | 1, 12 | S |
| B8 | ~No tests | whole repo | 12 (and all) | M |
| C1 | Privacy claim vs Tier 2 reality | `Hero.tsx`, `llmClient.ts` | ship-blocker | S |
| C2 | Anonymous-only identity | `session.ts` | 7, 8, 9 | L |

_S/M/L = rough relative effort. No code was modified to produce this report._

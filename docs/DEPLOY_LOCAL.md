# Running Lumina locally

Two ways to run it. Both serve the app at **http://localhost:3000**.

## 1. Production build (what "deploy locally" means)

Double-click **`Lumina - Deploy Local.bat`**, or:

```bash
npx prisma migrate deploy   # bring dev.db up to date with the schema
npm run build               # ~30s
npm start
```

This is the optimised build — the same code path a real deployment runs.
Verified working: landing page, dashboard, resume upload, ATS analysis,
PDF/DOCX export, application tracker, career profile.

## 2. Development (hot reload)

`Lumina - Run Local.bat`, or `npm run dev`. Use this while editing.

---

## What runs where

| Piece | Needed? | If missing |
|---|---|---|
| **Next.js app** | Required | — |
| **Python job backend** (`backend/`) | Optional | Job search falls back to built-in TypeScript providers (Adzuna/Jooble). Everything else is unaffected. |
| **Own ML model** (`backend/ml/`) | Optional | Role prediction falls back to the deterministic query planner. |
| **Groq / Gemini key** | Optional | AI rewriting falls back to local rules. **Nothing is sent anywhere unless you opt in** via the badge in the dashboard header. |

Nothing above is required for the app to work — every layer degrades gracefully.

To run the Python backend too:

```bash
cd backend && .\.venv\Scripts\activate && uvicorn app.main:app --reload
```

Then set `JOBS_API_URL=http://localhost:8000` in `.env.local` so the app proxies to it.

## Docker (whole stack: web + api + postgres + redis + worker)

Requires **Docker Desktop to be running first** — start it from the Start menu
and wait for the whale icon to settle.

```bash
docker compose up -d --build     # first run, or after code changes
docker compose down              # stop
```

Note: the API image does not install `requirements-ml.txt`, so the trained role
classifier isn't available inside Docker — job search uses the deterministic
planner there. That's intentional (it keeps the image small) and degrades
gracefully.

## Database

SQLite at `dev.db`. After changing `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name your_change
npx prisma generate
```

`npx prisma generate` is easy to forget and causes confusing type errors.

## Tests

```bash
npm run test:all
```

`npm test` (unit + component) and `npm run test:e2e` (Playwright) run separately.
E2E uses its own `e2e.db` and never touches `dev.db`.

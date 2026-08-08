#!/usr/bin/env bash
# Build sonar-upload/ — a copy of ONLY the files that should be scanned/committed.
#
# Excludes, deliberately: .env* (live API keys), samples/ (real resumes = personal
# data), node_modules, backend/.venv (1.4GB), .next, *.db, generated code, and the
# ML data/model artifacts. Re-run any time; it rebuilds from scratch.
set -e
cd "$(dirname "$0")/.."
OUT="sonar-upload"

rm -rf "$OUT"
mkdir -p "$OUT"

# --- source trees ---------------------------------------------------------
mkdir -p "$OUT/src"
# src minus the generated Prisma client
(cd src && find . -type f -not -path "./generated/*" -print0) \
  | (cd src && tar --null -cf - --files-from=-) | (cd "$OUT/src" && tar -xf -)

mkdir -p "$OUT/backend"
cp -r backend/app  "$OUT/backend/app"
cp -r backend/tests "$OUT/backend/tests"
mkdir -p "$OUT/backend/ml"
cp backend/ml/*.py backend/ml/*.md "$OUT/backend/ml/" 2>/dev/null || true
cp backend/requirements*.txt "$OUT/backend/" 2>/dev/null || true

cp -r shared   "$OUT/shared"
cp -r prisma   "$OUT/prisma"
cp -r e2e      "$OUT/e2e"
cp -r scripts  "$OUT/scripts"
cp -r docs     "$OUT/docs" 2>/dev/null || true

# --- config + docs at root ------------------------------------------------
for f in sonar-project.properties package.json package-lock.json tsconfig.json \
         next.config.ts postcss.config.mjs eslint.config.mjs prisma.config.ts \
         vitest.config.mts vitest.setup.ts playwright.config.ts \
         Dockerfile.web docker-compose.yml .dockerignore .gitignore \
         README.md CODEBASE_MAP.md AGENTS.md CLAUDE.md; do
  [ -f "$f" ] && cp "$f" "$OUT/" || true
done

# --- strip caches that may have been copied -------------------------------
find "$OUT" -name "__pycache__" -type d -prune -exec rm -rf {} + 2>/dev/null || true
find "$OUT" -name "*.pyc" -delete 2>/dev/null || true

# --- SAFETY GATE: refuse to hand over secrets or personal data ------------
FAIL=0
for bad in ".env" ".env.local" "samples" "node_modules" ".venv" ".next" \
           "src/generated" "backend/ml/data" "backend/ml/models"; do
  if [ -e "$OUT/$bad" ]; then echo "LEAK: $bad is in the bundle"; FAIL=1; fi
done
if find "$OUT" -name "*.db" -o -name "*.docx" -o -name "*.joblib" | grep -q .; then
  echo "LEAK: database / document / model file in the bundle"; FAIL=1
fi
[ "$FAIL" = "1" ] && { echo "ABORTED — bundle not safe to share."; exit 1; }

echo "OK  -> $OUT  ($(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1))"

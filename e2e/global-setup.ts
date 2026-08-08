import { execSync } from "node:child_process";

/**
 * Apply migrations to the E2E database before any test runs.
 *
 * Without this, adding a model to schema.prisma makes the whole suite fail with
 * confusing errors — dev.db has the new tables and e2e.db doesn't. Migrating
 * here means the E2E database is always in step with the schema.
 */
export default function globalSetup() {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./e2e.db" },
  });
}

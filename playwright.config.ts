import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * Runs against a real production build on a dedicated port with its own SQLite
 * file, so a test run can never touch the development database. `npm run build`
 * is intentionally NOT part of webServer's command in CI-less local runs — the
 * server reuses an existing one when present to keep the loop fast.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // Keeps e2e.db in step with schema.prisma — see e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  // Journeys share a server; running them in parallel makes failures hard to read.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? "line" : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      // A separate database file — E2E must never mutate dev.db.
      DATABASE_URL: "file:./e2e.db",
      NODE_ENV: "production",
    },
  },
});

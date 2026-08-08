/**
 * Application tracking and the optional-account flow.
 *
 * The auth journey is the one with the most ways to silently lose someone's
 * work, so it is asserted end to end: anonymous use must work with no account,
 * and signing up must CLAIM what was already created rather than starting empty.
 */
import { test, expect } from "@playwright/test";

/** Unique per run so re-runs don't collide on the unique email constraint. */
/**
 * The dashboard now reveals sections progressively (StoryStage), so a stage must
 * be opened before its contents exist in the DOM. That is the intended UX — the
 * page used to stack twelve sections at once.
 */
async function openStage(page: import("@playwright/test").Page, title: string) {
  const trigger = page.getByRole("button", { name: new RegExp(title, "i") });
  await trigger.click();
}

const uniqueEmail = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const PASSWORD = "e2e-test-password";

test.describe("application tracker", () => {
  test("adds an application and moves it through the pipeline", async ({ page }) => {
    await page.goto("/dashboard");
    await openStage(page, "Find and track roles");
    await expect(page.getByText("Application tracker")).toBeVisible();

    await page.getByRole("button", { name: /Add manually/ }).click();
    await page.getByPlaceholder("Company").fill("Druva");
    await page.getByPlaceholder("Job title").fill("Senior Data Engineer");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const row = page.locator("li", { hasText: "Senior Data Engineer" }).first();
    await expect(row).toBeVisible();
    await expect(page.getByText("Druva")).toBeVisible();

    // Advance saved -> applied and confirm it sticks across a reload.
    await row.getByRole("button", { name: /^Applied/ }).click();
    await expect(row.getByRole("combobox")).toHaveValue("applied");

    await page.reload();
    await openStage(page, "Find and track roles");
    const reloaded = page.locator("li", { hasText: "Senior Data Engineer" }).first();
    await expect(reloaded.getByRole("combobox")).toHaveValue("applied");
  });

  test("shows the pipeline in career insights", async ({ page }) => {
    await page.goto("/dashboard");
    await openStage(page, "Track your progress");
    await expect(page.getByText("Career insights")).toBeVisible();
  });
});

test.describe("optional accounts", () => {
  test("works with no account, then signing up keeps the work already done", async ({ page }) => {
    await page.goto("/dashboard");

    // 1. Anonymous use — the "no sign-up" promise on the landing page.
    await expect(page.getByRole("button", { name: /Save my work/ })).toBeVisible();
    await openStage(page, "Find and track roles");
    await page.getByRole("button", { name: /Add manually/ }).click();
    await page.getByPlaceholder("Company").fill("Anonymous Co");
    await page.getByPlaceholder("Job title").fill("Data Engineer");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Anonymous Co")).toBeVisible();

    // 2. Create an account.
    const email = uniqueEmail();
    await page.getByRole("button", { name: /Save my work/ }).click();
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder(/Password/).fill(PASSWORD);
    await page.getByRole("button", { name: /Create account/ }).click();

    // 3. The work created anonymously must still be there.
    await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible({ timeout: 20_000 });
    await openStage(page, "Find and track roles");
    await expect(page.getByText("Anonymous Co")).toBeVisible();
  });

  test("rejects a weak password instead of creating a fragile account", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: /Save my work/ }).click();
    await page.getByPlaceholder("you@example.com").fill(uniqueEmail());
    // minLength on the input blocks the very short case, so use 8+ chars that
    // still fail server-side validation is not possible — assert the client gate.
    await page.getByPlaceholder(/Password/).fill("short");
    await page.getByRole("button", { name: /Create account/ }).click();

    // The form must not have submitted — the account button is still showing.
    await expect(page.getByRole("button", { name: /Create account/ })).toBeVisible();
  });

  test("signing out returns to the anonymous state", async ({ page }) => {
    await page.goto("/dashboard");
    const email = uniqueEmail();

    await page.getByRole("button", { name: /Save my work/ }).click();
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder(/Password/).fill(PASSWORD);
    await page.getByRole("button", { name: /Create account/ }).click();
    await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Sign out/ }).click();
    await expect(page.getByRole("button", { name: /Save my work/ })).toBeVisible({ timeout: 20_000 });
  });
});

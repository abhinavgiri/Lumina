/**
 * The core journey: upload a resume, analyse it, act on the result.
 *
 * This is the path every user takes, and the one that spans the most layers —
 * file parsing, the ATS engine, the API envelope, and the dashboard. Unit tests
 * cover each piece; only this proves they work together.
 */
import { test, expect } from "@playwright/test";
import path from "node:path";

const RESUME = path.join(__dirname, "..", "samples", "Abhinav_Giri_Goswami_Resume.docx");
const JD = `Data Engineer
Required: 5+ years experience with Python, Spark, Airflow, Snowflake and SQL.
Must have a Bachelor's degree.
Nice to have: dbt, AWS.`;

test.describe("resume analysis", () => {
  test("uploads a resume, analyses it, and shows a scored ATS breakdown", async ({ page }) => {
    await page.goto("/dashboard");

    // UploadCard renders TWO file inputs: react-dropzone's, plus an explicit
    // one carrying NATIVE_INPUT_ID so mobile taps open the OS picker directly.
    // Target the identified one — 'input[type=file]' matches both.
    await page.locator("#resume-native-file-input").setInputFiles(RESUME);
    await expect(page.getByText("Resume preview")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/ABHINAV GIRI GOSWAMI/i).first()).toBeVisible();

    // Analyse against a job description.
    await page.getByPlaceholder(/Paste the full job description/).fill(JD);
    await page.getByRole("button", { name: /Analyze Resume/ }).click();

    // The staged progress runs for ~3s by design before results appear.
    await expect(page.getByText("ATS Score", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("ATS score breakdown")).toBeVisible();

    // Every one of the nine categories should be listed.
    for (const label of [
      "ATS compatibility",
      "Contact information",
      "Formatting",
      "Keywords",
      "Experience",
      "Achievements",
      "Skills",
      "Projects",
      "Grammar",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // With a JD supplied, Keywords must actually be scored.
    await expect(page.getByText(/Scored against the job description/)).toBeVisible();
  });

  test("expanding a category reveals its checks and how to fix them", async ({ page }) => {
    await page.goto("/dashboard");
    await page.locator("#resume-native-file-input").setInputFiles(RESUME);
    await expect(page.getByText("Resume preview")).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder(/Paste the full job description/).fill(JD);
    await page.getByRole("button", { name: /Analyze Resume/ }).click();
    await expect(page.getByText("ATS score breakdown")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /Achievements/ }).click();
    // The detail is written in the user's own numbers.
    await expect(page.getByText(/bullets include a number/)).toBeVisible();
  });

  test("keeps the analysis after a page reload", async ({ page }) => {
    // The session cookie must persist the uploaded resume across navigations —
    // this is what broke when sessions were forgeable.
    await page.goto("/dashboard");
    await page.locator("#resume-native-file-input").setInputFiles(RESUME);
    await expect(page.getByText("Resume preview")).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText("Resume preview")).toBeVisible({ timeout: 20_000 });
  });
});

/**
 * Component tests for the ATS breakdown.
 *
 * These check the things a user would actually notice and that the unit tests
 * can't see: that a not-applicable category is visibly marked rather than shown
 * as a zero, that a failing check surfaces its fix, and that the highest-value
 * fixes are what's displayed.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AtsBreakdown from "@/components/dashboard/AtsBreakdown";
import type { AtsReport } from "@/lib/ats/engine";

function report(overrides: Partial<AtsReport> = {}): AtsReport {
  return {
    overall: 72,
    jdAware: true,
    topFixes: [
      { category: "Keywords", fix: "Work the missing keywords into your bullets.", points: 5 },
      { category: "Achievements", fix: "Add measurable outcomes to your bullets.", points: 3 },
    ],
    categories: [
      {
        id: "contact",
        label: "Contact information",
        rationale: "A recruiter who can't contact you can't hire you.",
        score: 8,
        maxScore: 8,
        applicable: true,
        checks: [
          { label: "Email address", passed: true, points: 3, maxPoints: 3, detail: "Email detected." },
          { label: "Phone number", passed: true, points: 3, maxPoints: 3, detail: "Phone detected." },
        ],
      },
      {
        id: "achievements",
        label: "Achievements",
        rationale: "Quantified outcomes are the biggest differentiator.",
        score: 4,
        maxScore: 15,
        applicable: true,
        checks: [
          {
            label: "Bullets with a measurable outcome",
            passed: false,
            points: 4,
            maxPoints: 9,
            detail: "2 of 9 bullets include a number.",
            fix: "Add volumes handled or % improvements.",
          },
        ],
      },
      {
        id: "projects",
        label: "Projects",
        rationale: "Optional once you have a track record.",
        score: 0,
        maxScore: 5,
        applicable: false,
        checks: [
          {
            label: "Projects listed",
            passed: false,
            points: 0,
            maxPoints: 5,
            detail: "No projects listed — optional given your work experience.",
            fix: "Add one or two projects.",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("AtsBreakdown", () => {
  it("lists every category with its score", () => {
    render(<AtsBreakdown ats={report()} />);
    expect(screen.getByText("Contact information")).toBeInTheDocument();
    expect(screen.getByText("8/8")).toBeInTheDocument();
    expect(screen.getByText("4/15")).toBeInTheDocument();
  });

  it("marks a not-applicable category instead of showing it as zero", () => {
    // The fairness rule made visible: a senior candidate with no projects must
    // not appear to have scored 0/5.
    render(<AtsBreakdown ats={report()} />);
    expect(screen.getByText("not scored")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0/5")).not.toBeInTheDocument();
  });

  it("reveals the checks and the fix when a category is expanded", async () => {
    const user = userEvent.setup();
    render(<AtsBreakdown ats={report()} />);

    expect(screen.queryByText(/2 of 9 bullets/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Achievements/ }));

    expect(screen.getByText(/2 of 9 bullets include a number/)).toBeInTheDocument();
    expect(screen.getByText(/Add volumes handled/)).toBeInTheDocument();
    expect(screen.getByText(/biggest differentiator/)).toBeInTheDocument();
  });

  it("does not show a fix for a check that passed", async () => {
    const user = userEvent.setup();
    render(<AtsBreakdown ats={report()} />);
    await user.click(screen.getByRole("button", { name: /Contact information/ }));

    expect(screen.getByText("Email detected.")).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it("shows the highest-value fixes with their point values", () => {
    render(<AtsBreakdown ats={report()} />);
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText(/Work the missing keywords/)).toBeInTheDocument();
  });

  it("tells the user when no job description informed the score", () => {
    render(<AtsBreakdown ats={report({ jdAware: false })} />);
    expect(screen.getByText(/Add a job description/)).toBeInTheDocument();
  });

  it("says the score used the job description when one was supplied", () => {
    render(<AtsBreakdown ats={report()} />);
    expect(screen.getByText(/Scored against the job description/)).toBeInTheDocument();
  });

  it("renders without a fixes panel when nothing needs fixing", () => {
    render(<AtsBreakdown ats={report({ topFixes: [] })} />);
    expect(screen.queryByText(/Worth the most points/)).not.toBeInTheDocument();
  });
});

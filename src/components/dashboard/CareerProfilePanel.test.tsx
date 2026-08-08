/**
 * Component tests for the Career Profile panel.
 *
 * The point of this panel is showing things a single resume can't: which skills
 * are NEW (growth over time) and what the person has committed to learning. Those
 * are what these assert.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CareerProfilePanel from "@/components/dashboard/CareerProfilePanel";
import type { CareerProfile } from "@/lib/client/lumina";

const api = {
  fetchProfile: vi.fn(),
  updateProfile: vi.fn(),
  addLearningItem: vi.fn(),
  updateLearningItem: vi.fn(),
  deleteLearningItem: vi.fn(),
};

vi.mock("@/lib/client/lumina", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/lumina")>();
  return {
    ...actual,
    fetchProfile: (...a: unknown[]) => api.fetchProfile(...a),
    updateProfile: (...a: unknown[]) => api.updateProfile(...a),
    addLearningItem: (...a: unknown[]) => api.addLearningItem(...a),
    updateLearningItem: (...a: unknown[]) => api.updateLearningItem(...a),
    deleteLearningItem: (...a: unknown[]) => api.deleteLearningItem(...a),
  };
});

const skill = (name: string) => ({
  name,
  source: "resume",
  proficiency: null,
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
});

const profile = (o: Partial<CareerProfile> = {}): CareerProfile => ({
  targetRoles: ["Data Engineer"],
  seniority: "mid",
  preferredLocation: "Hyderabad",
  openToRemote: true,
  skills: [skill("SQL"), skill("dbt")],
  learning: [
    { id: "l1", skill: "Apache Airflow", status: "planned", source: "roadmap", notes: null, targetDate: null, completedAt: null },
  ],
  recentlyAdded: ["dbt"],
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchProfile.mockResolvedValue(profile());
});

describe("CareerProfilePanel", () => {
  it("shows target roles, skills and learning items", async () => {
    render(<CareerProfilePanel />);
    expect(await screen.findByText("Data Engineer")).toBeInTheDocument();
    expect(screen.getByText("SQL")).toBeInTheDocument();
    expect(screen.getByText("Apache Airflow")).toBeInTheDocument();
  });

  it("marks recently-added skills as new — the growth signal", async () => {
    render(<CareerProfilePanel />);
    await screen.findByText("SQL");

    // "dbt" is in recentlyAdded, "SQL" is not.
    expect(screen.getByText("new")).toBeInTheDocument();
    expect(screen.getByText(/1 new in the last 90 days/)).toBeInTheDocument();
  });

  it("prompts for target roles when none are set", async () => {
    api.fetchProfile.mockResolvedValue(profile({ targetRoles: [] }));
    render(<CareerProfilePanel />);
    expect(await screen.findByText(/sharpens job search and gap analysis/)).toBeInTheDocument();
  });

  it("saves edited target roles as a list", async () => {
    const user = userEvent.setup();
    api.updateProfile.mockResolvedValue(profile({ targetRoles: ["Data Engineer", "Analytics Engineer"] }));
    render(<CareerProfilePanel />);
    await screen.findByText("Data Engineer");

    await user.click(screen.getByRole("button", { name: /Edit/ }));
    const input = screen.getByPlaceholderText(/Data Engineer, Analytics Engineer/);
    await user.clear(input);
    await user.type(input, "Data Engineer, Analytics Engineer");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith({
        targetRoles: ["Data Engineer", "Analytics Engineer"],
      })
    );
  });

  it("adds a learning commitment", async () => {
    const user = userEvent.setup();
    api.addLearningItem.mockResolvedValue({ id: "l2", skill: "Snowflake", status: "planned", source: "manual", notes: null, targetDate: null, completedAt: null });
    render(<CareerProfilePanel />);
    await screen.findByText("Apache Airflow");

    await user.type(screen.getByPlaceholderText("Add a skill to learn"), "Snowflake");
    await user.click(screen.getByRole("button", { name: /Add learning item/ }));

    await waitFor(() => expect(api.addLearningItem).toHaveBeenCalledWith({ skill: "Snowflake" }));
  });

  it("advances a learning item planned -> learning in one click", async () => {
    const user = userEvent.setup();
    api.updateLearningItem.mockResolvedValue({ id: "l1", skill: "Apache Airflow", status: "learning", source: "roadmap", notes: null, targetDate: null, completedAt: null });
    render(<CareerProfilePanel />);
    await screen.findByText("Apache Airflow");

    await user.click(screen.getByRole("button", { name: "Planned" }));
    await waitFor(() => expect(api.updateLearningItem).toHaveBeenCalledWith("l1", { status: "learning" }));
  });

  it("shows where a learning item came from", async () => {
    render(<CareerProfilePanel />);
    expect(await screen.findByText("from roadmap")).toBeInTheDocument();
  });

  it("removes a learning item", async () => {
    const user = userEvent.setup();
    api.deleteLearningItem.mockResolvedValue({ id: "l1" });
    render(<CareerProfilePanel />);
    await screen.findByText("Apache Airflow");

    await user.click(screen.getByRole("button", { name: /Remove Apache Airflow/ }));
    await waitFor(() => expect(api.deleteLearningItem).toHaveBeenCalledWith("l1"));
  });

  it("surfaces a duplicate-skill rejection from the server", async () => {
    const user = userEvent.setup();
    api.addLearningItem.mockRejectedValue(new Error("dbt is already on your learning list."));
    render(<CareerProfilePanel />);
    await screen.findByText("Apache Airflow");

    await user.type(screen.getByPlaceholderText("Add a skill to learn"), "dbt");
    await user.click(screen.getByRole("button", { name: /Add learning item/ }));

    expect(await screen.findByText(/already on your learning list/)).toBeInTheDocument();
  });

  it("explains what to do when there are no skills yet", async () => {
    api.fetchProfile.mockResolvedValue(profile({ skills: [], recentlyAdded: [] }));
    render(<CareerProfilePanel />);
    expect(await screen.findByText(/Upload or build a resume/)).toBeInTheDocument();
  });

  it("surfaces a load failure rather than rendering an empty profile", async () => {
    api.fetchProfile.mockRejectedValue(new Error("profile unavailable"));
    render(<CareerProfilePanel />);
    expect(await screen.findByText(/profile unavailable/)).toBeInTheDocument();
  });
});

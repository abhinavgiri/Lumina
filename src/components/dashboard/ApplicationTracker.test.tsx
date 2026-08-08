/**
 * Component tests for the application pipeline.
 *
 * The interesting behaviour here is optimistic updating: the board changes
 * instantly and must ROLL BACK if the server rejects the change. A tracker that
 * silently keeps a status the server never accepted would quietly lie to
 * someone about where their job applications stand.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ApplicationTracker from "@/components/dashboard/ApplicationTracker";
import type { Application, ApplicationStats } from "@/lib/client/lumina";

const api = {
  fetchApplications: vi.fn(),
  createApplication: vi.fn(),
  updateApplication: vi.fn(),
  deleteApplication: vi.fn(),
};

vi.mock("@/lib/client/lumina", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/client/lumina")>();
  return {
    ...actual,
    fetchApplications: (...a: unknown[]) => api.fetchApplications(...a),
    createApplication: (...a: unknown[]) => api.createApplication(...a),
    updateApplication: (...a: unknown[]) => api.updateApplication(...a),
    deleteApplication: (...a: unknown[]) => api.deleteApplication(...a),
  };
});

const app = (o: Partial<Application> = {}): Application => ({
  id: "a1",
  company: "Druva",
  title: "Senior Data Engineer",
  location: "Bengaluru",
  url: null,
  source: "Greenhouse",
  matchPercent: 82,
  status: "saved",
  notes: null,
  resumeId: null,
  appliedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...o,
});

const stats = (o: Partial<ApplicationStats> = {}): ApplicationStats => ({
  total: 1,
  byStatus: { saved: 1, applied: 0, interviewing: 0, offer: 0, rejected: 0 },
  interviewRate: null,
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchApplications.mockResolvedValue({ applications: [app()], stats: stats() });
});

describe("ApplicationTracker", () => {
  it("renders saved applications", async () => {
    render(<ApplicationTracker resumeId={null} />);
    expect(await screen.findByText("Senior Data Engineer")).toBeInTheDocument();
    expect(screen.getByText("Druva")).toBeInTheDocument();
    expect(screen.getByText("82% match")).toBeInTheDocument();
  });

  it("explains the value of tracking when the pipeline is empty", async () => {
    api.fetchApplications.mockResolvedValue({
      applications: [],
      stats: stats({ total: 0, byStatus: { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 } }),
    });
    render(<ApplicationTracker resumeId={null} />);
    expect(await screen.findByText(/turn into interviews is how you learn/i)).toBeInTheDocument();
  });

  it("updates status through the server", async () => {
    const user = userEvent.setup();
    api.updateApplication.mockResolvedValue(app({ status: "applied" }));
    render(<ApplicationTracker resumeId={null} />);
    await screen.findByText("Senior Data Engineer");

    await user.selectOptions(screen.getByRole("combobox"), "applied");

    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith("a1", { status: "applied" }));
  });

  it("ROLLS BACK an optimistic status change when the server rejects it", async () => {
    const user = userEvent.setup();
    api.updateApplication.mockRejectedValue(new Error("Server said no"));
    render(<ApplicationTracker resumeId={null} />);
    await screen.findByText("Senior Data Engineer");

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await user.selectOptions(select, "offer");

    // The row must return to its real status, and the failure must be visible.
    await waitFor(() => expect(select.value).toBe("saved"));
    expect(screen.getByText(/Server said no/)).toBeInTheDocument();
  });

  it("advances to the next stage via the shortcut button", async () => {
    const user = userEvent.setup();
    api.updateApplication.mockResolvedValue(app({ status: "applied" }));
    render(<ApplicationTracker resumeId={null} />);
    await screen.findByText("Senior Data Engineer");

    await user.click(screen.getByRole("button", { name: /^Applied/ }));
    await waitFor(() => expect(api.updateApplication).toHaveBeenCalledWith("a1", { status: "applied" }));
  });

  it("offers no next stage once an application is at Offer", async () => {
    api.fetchApplications.mockResolvedValue({
      applications: [app({ status: "offer" })],
      stats: stats({ byStatus: { saved: 0, applied: 0, interviewing: 0, offer: 1, rejected: 0 } }),
    });
    render(<ApplicationTracker resumeId={null} />);
    await screen.findByText("Senior Data Engineer");
    expect(screen.queryByRole("button", { name: /^Rejected/ })).not.toBeInTheDocument();
  });

  it("adds an application manually", async () => {
    const user = userEvent.setup();
    api.createApplication.mockResolvedValue(app({ id: "a2", company: "Postman", title: "Analytics Engineer" }));
    render(<ApplicationTracker resumeId="r1" />);
    await screen.findByText("Senior Data Engineer");

    await user.click(screen.getByRole("button", { name: /Add manually/ }));
    await user.type(screen.getByPlaceholderText("Company"), "Postman");
    await user.type(screen.getByPlaceholderText("Job title"), "Analytics Engineer");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createApplication).toHaveBeenCalledWith(
        expect.objectContaining({ company: "Postman", title: "Analytics Engineer", resumeId: "r1" })
      )
    );
  });

  it("removes an application", async () => {
    const user = userEvent.setup();
    api.deleteApplication.mockResolvedValue({ id: "a1" });
    render(<ApplicationTracker resumeId={null} />);
    await screen.findByText("Senior Data Engineer");

    await user.click(screen.getByRole("button", { name: /Remove Senior Data Engineer/ }));
    await waitFor(() => expect(api.deleteApplication).toHaveBeenCalledWith("a1"));
  });

  it("shows the interview rate once there is one", async () => {
    api.fetchApplications.mockResolvedValue({
      applications: [app({ status: "interviewing" })],
      stats: stats({ interviewRate: 33, byStatus: { saved: 0, applied: 2, interviewing: 1, offer: 0, rejected: 0 } }),
    });
    render(<ApplicationTracker resumeId={null} />);
    expect(await screen.findByText(/33% reached interview/)).toBeInTheDocument();
  });

  it("surfaces a load failure instead of rendering an empty board", async () => {
    api.fetchApplications.mockRejectedValue(new Error("network down"));
    render(<ApplicationTracker resumeId={null} />);
    expect(await screen.findByText(/network down/)).toBeInTheDocument();
  });
});

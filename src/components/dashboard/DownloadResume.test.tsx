/**
 * Component tests for the download control.
 *
 * The bug this component exists to fix (B21) was that no UI ever passed
 * `?template=`, so every download silently used one style. These assert the
 * links actually carry the chosen template — the thing that was broken.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DownloadResume from "@/components/dashboard/DownloadResume";

const pdfLink = () => screen.getByRole("link", { name: /PDF/i });
const docxLink = () => screen.getByRole("link", { name: /DOCX/i });

describe("DownloadResume", () => {
  it("builds PDF and DOCX links from the base url", () => {
    render(<DownloadResume baseUrl="/api/resume/abc/download" />);
    expect(pdfLink()).toHaveAttribute("href", expect.stringContaining("/api/resume/abc/download?format=pdf"));
    expect(docxLink()).toHaveAttribute("href", "/api/resume/abc/download?format=docx");
  });

  it("defaults to the modern template", () => {
    render(<DownloadResume baseUrl="/api/resume/abc/download" />);
    expect(pdfLink()).toHaveAttribute("href", expect.stringContaining("template=modern"));
    expect(screen.getByRole("button", { name: /Modern style/ })).toBeInTheDocument();
  });

  it("puts the chosen template into the PDF link", async () => {
    const user = userEvent.setup();
    render(<DownloadResume baseUrl="/api/resume/abc/download" />);

    await user.click(screen.getByRole("button", { name: /style/ }));
    await user.click(screen.getByRole("button", { name: /Compact/ }));

    expect(pdfLink()).toHaveAttribute("href", expect.stringContaining("template=compact"));
    expect(screen.getByRole("button", { name: /Compact style/ })).toBeInTheDocument();
  });

  it("offers all four templates, each explaining what it's for", async () => {
    const user = userEvent.setup();
    render(<DownloadResume baseUrl="/api/resume/abc/download" />);
    await user.click(screen.getByRole("button", { name: /style/ }));

    for (const name of ["Modern", "Classic", "Compact", "Minimal"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText(/fits a long resume onto one page/i)).toBeInTheDocument();
  });

  it("passes the accent through to the PDF link only", () => {
    render(<DownloadResume baseUrl="/api/resume/abc/download" accent="ocean" />);
    expect(pdfLink()).toHaveAttribute("href", expect.stringContaining("accent=ocean"));
    // DOCX has no template or accent — the generator ignores them.
    expect(docxLink().getAttribute("href")).not.toContain("accent");
  });

  it("closes the picker after a choice is made", async () => {
    const user = userEvent.setup();
    render(<DownloadResume baseUrl="/api/resume/abc/download" />);

    await user.click(screen.getByRole("button", { name: /style/ }));
    expect(screen.getByText(/Quiet and highly legible/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Minimal/ }));
    expect(screen.queryByText(/Quiet and highly legible/)).not.toBeInTheDocument();
  });

  it("tells the user that template choice does not affect ATS parsing", async () => {
    const user = userEvent.setup();
    render(<DownloadResume baseUrl="/api/resume/abc/download" />);
    await user.click(screen.getByRole("button", { name: /style/ }));
    expect(screen.getByText(/an ATS reads them identically/i)).toBeInTheDocument();
  });
});

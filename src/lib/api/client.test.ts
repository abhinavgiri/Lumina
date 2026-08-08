/**
 * Tests for the client-side envelope unwrapping — every component's requests
 * now flow through here, so its failure modes matter more than any single call.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiPost, errorMessage } from "@/lib/api/client";

function mockFetch(body: unknown, status = 200, opts: { reject?: boolean; nonJson?: boolean } = {}) {
  const fn = vi.fn(async () => {
    if (opts.reject) throw new TypeError("Failed to fetch");
    return {
      status,
      json: async () => {
        if (opts.nonJson) throw new SyntaxError("Unexpected token <");
        return body;
      },
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("apiPost", () => {
  it("returns the unwrapped data on success", async () => {
    mockFetch({ ok: true, data: { resumeId: "r1" } });
    await expect(apiPost("/api/x", { a: 1 })).resolves.toEqual({ resumeId: "r1" });
  });

  it("sends JSON with the right headers and method", async () => {
    const fn = mockFetch({ ok: true, data: null });
    await apiPost("/api/x", { a: 1 });
    expect(fn).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"a":1}',
    });
  });

  it("throws the server's message on a failure envelope", async () => {
    mockFetch({ ok: false, error: "Resume not found." }, 404);
    await expect(apiPost("/api/x")).rejects.toThrow("Resume not found.");
  });

  it("exposes the HTTP status on the thrown error", async () => {
    mockFetch({ ok: false, error: "Nope." }, 422);
    await expect(apiPost("/api/x")).rejects.toMatchObject({
      status: 422,
      name: "ApiClientError",
    });
  });

  it("reports a network failure rather than hanging or leaking a TypeError", async () => {
    mockFetch(null, 0, { reject: true });
    await expect(apiPost("/api/x")).rejects.toThrow(/Network error/);
  });

  it("handles a non-JSON response (proxy error page, crash)", async () => {
    mockFetch(null, 502, { nonJson: true });
    await expect(apiPost("/api/x")).rejects.toThrow(/Unexpected response from the server \(502\)/);
  });
});

describe("errorMessage", () => {
  it("prefers the API message, then Error.message, then the fallback", () => {
    expect(errorMessage(new ApiClientError("Bad thing.", 400))).toBe("Bad thing.");
    expect(errorMessage(new Error("Boom"))).toBe("Boom");
    expect(errorMessage("a string", "Fallback.")).toBe("Fallback.");
  });
});

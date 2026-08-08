/**
 * Tests for the API response contract — the thing every route now depends on.
 *
 * These are true unit tests (not characterization): the envelope is new code
 * with intended behavior, so they assert what it SHOULD do.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  badRequest,
  fail,
  notFound,
  ok,
  readJson,
  unprocessable,
  withApi,
} from "@/lib/api/response";

const jsonRequest = (body: string) =>
  new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

describe("ok / fail", () => {
  it("wraps success payloads in { ok: true, data }", async () => {
    const res = ok({ score: 82 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { score: 82 } });
  });

  it("wraps failures in { ok: false, error } with the given status", async () => {
    const res = fail("Nope.", 404);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Nope." });
  });
});

describe("ApiError helpers", () => {
  it("carry the right status codes", () => {
    expect(badRequest("x").status).toBe(400);
    expect(notFound("x").status).toBe(404);
    expect(unprocessable("x").status).toBe(422);
    expect(new ApiError("x").status).toBe(400);
  });
});

describe("withApi", () => {
  it("passes successful responses straight through", async () => {
    const handler = withApi("test", async () => ok({ fine: true }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { fine: true } });
  });

  it("converts a thrown ApiError into its status and message", async () => {
    const handler = withApi("test", async () => {
      throw notFound("Resume not found.");
    });
    const res = await handler();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Resume not found." });
  });

  it("preserves validation details on a 400", async () => {
    const handler = withApi("test", async () => {
      throw badRequest("Invalid resume data.", { fieldErrors: { name: ["Required"] } });
    });
    expect(await (await handler()).json()).toEqual({
      ok: false,
      error: "Invalid resume data.",
      details: { fieldErrors: { name: ["Required"] } },
    });
  });

  it("turns an unexpected throw into a generic shaped 500, leaking nothing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withApi("test", async () => {
      throw new Error("DB password is hunter2");
    });
    const res = await handler();

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Something went wrong. Please try again." });
    expect(JSON.stringify(body)).not.toContain("hunter2"); // internals stay internal
    expect(spy).toHaveBeenCalled(); // but they ARE logged server-side
    spy.mockRestore();
  });
});

describe("readJson", () => {
  it("parses a valid JSON body", async () => {
    expect(await readJson(jsonRequest('{"resumeId":"abc"}'))).toEqual({ resumeId: "abc" });
  });

  it("turns malformed JSON into a 400 instead of crashing the route", async () => {
    // This is the bug class that used to escape as an unshaped 500 from
    // /api/resume/tailor and /api/roadmap.
    const handler = withApi("test", async () => ok(await readJson(jsonRequest("{not json"))));
    const res = await handler();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid request body." });
  });
});

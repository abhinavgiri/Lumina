/**
 * The single API response contract — server side.
 *
 * Before this, every route invented its own success shape and handled (or
 * forgot to handle) errors on its own: /api/analyze wrapped everything in
 * try/catch, /api/resume/tailor and /api/roadmap wrapped nothing, so a malformed
 * body escaped as an unshaped 500 that the client couldn't even read an error
 * from.
 *
 * Now: every JSON route returns `{ ok: true, data }` or `{ ok: false, error }`,
 * and `withApi` supplies the try/catch, logging, and status mapping once.
 *
 * Pair with `apiFetch` in lib/api/client.ts, which unwraps this on the client.
 */
import { NextResponse } from "next/server";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: string; details?: unknown };
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

/** A failure that carries its own HTTP status. Throw from anywhere in a service. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 400 — the caller sent something invalid. */
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(message, 400, details);

/** 404 — the resource doesn't exist, or isn't this user's. */
export const notFound = (message: string) => new ApiError(message, 404);

/** 422 — well-formed request we understood but can't process. */
export const unprocessable = (message: string) => new ApiError(message, 422);

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, { status });
}

export function fail(message: string, status = 400, details?: unknown): NextResponse<ApiFailure> {
  return NextResponse.json({ ok: false as const, error: message, details }, { status });
}

/**
 * Wrap a route handler so every failure becomes a shaped response instead of an
 * unhandled 500. ApiError keeps its status and message; anything else is logged
 * in full and reported generically — internal details never reach the client.
 */
export function withApi<Args extends unknown[]>(
  name: string,
  handler: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.message, err.status, err.details);
      }
      console.error(`[api:${name}] unhandled error:`, err);
      return fail("Something went wrong. Please try again.", 500);
    }
  };
}

/** Parse a JSON body, converting malformed input into a 400 instead of a crash. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Invalid request body.");
  }
}

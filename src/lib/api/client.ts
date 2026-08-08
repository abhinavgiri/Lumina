/**
 * The single API response contract — client side.
 *
 * Components used to hand-roll `fetch` + `res.ok` + `data.error ?? "..."` at ten
 * different call sites, each with slightly different error handling. `apiFetch`
 * does it once: it unwraps the `{ ok, data }` envelope and throws a real Error
 * on failure, so callers can just `try { const x = await apiFetch<T>(...) }`.
 *
 * Typed: `apiFetch<T>` returns T, so a mismatch between what a route sends and
 * what a component expects is a compile error rather than a runtime `undefined`.
 */
import type { ApiEnvelope } from "@/lib/api/response";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // Network-level failure: offline, DNS, connection reset.
    throw new ApiClientError("Network error — check your connection and try again.", 0);
  }

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    body = null; // non-JSON response (proxy error page, crash)
  }

  if (!body) {
    throw new ApiClientError(`Unexpected response from the server (${res.status}).`, res.status);
  }
  if (!body.ok) {
    throw new ApiClientError(body.error, res.status, body.details);
  }
  return body.data;
}

/** POST a JSON body and return the unwrapped payload. */
export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** POST multipart form data (file uploads) and return the unwrapped payload. */
export function apiPostForm<T>(url: string, form: FormData): Promise<T> {
  return request<T>(url, { method: "POST", body: form });
}

export function apiGet<T>(url: string): Promise<T> {
  return request<T>(url);
}

/** PATCH a JSON body and return the unwrapped payload. */
export function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T>(url: string): Promise<T> {
  return request<T>(url, { method: "DELETE" });
}

/** Normalize any thrown value into a user-facing message. */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

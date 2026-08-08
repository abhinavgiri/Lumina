/**
 * Who processes the user's resume — their choice, not ours.
 *
 * Before this, the tier was decided purely by whether a GROQ/GEMINI key existed
 * in the environment. If one did, every polish and rewrite silently sent the
 * user's full resume text to that provider. The user was never asked.
 *
 * Now the default is LOCAL, and cloud processing only happens after an explicit,
 * informed opt-in. That ordering matters: a resume contains someone's name,
 * phone number, employers and history. Sending it to a third party is their
 * decision to make, and they can only make it if we tell them plainly.
 *
 * Stored in a cookie so it works for anonymous users too — no account required
 * to have a privacy preference.
 */
import { cookies } from "next/headers";

export type AiMode = "local" | "cloud";

const COOKIE = "lumina_ai_mode";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * The user's choice. Defaults to LOCAL — never assume consent to send someone's
 * resume off their machine.
 */
export async function getAiMode(): Promise<AiMode> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value === "cloud" ? "cloud" : "local";
}

/** Persist the choice. Route Handlers / Server Actions only (it sets a cookie). */
export async function setAiMode(mode: AiMode): Promise<void> {
  (await cookies()).set(COOKIE, mode, {
    httpOnly: false, // the UI reads it to render the current state
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR,
    path: "/",
  });
}

/**
 * Whether a cloud call is permitted right now: the user must have opted in AND
 * a provider must actually be configured.
 */
export async function cloudAllowed(): Promise<boolean> {
  if ((await getAiMode()) !== "cloud") return false;
  const { llmProvider } = await import("@/lib/ai/llmClient");
  return llmProvider() !== null;
}

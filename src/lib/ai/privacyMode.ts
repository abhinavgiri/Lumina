/**
 * Which privacy claim is actually TRUE right now.
 *
 * The app used to state "your resume never leaves this device" unconditionally.
 * That is only true on the local tier. With a Groq/Gemini key configured
 * (Tier 2), resume text IS sent to that provider for rewriting/polish — so the
 * absolute claim becomes false and the UI must say something different.
 *
 * SERVER ONLY for the resolver (it reads env/keys); pass the resulting mode
 * down to client components as a prop. Never expose the key itself.
 */
import { llmProvider } from "@/lib/ai/llmClient";

export type PrivacyMode = "local" | "cloud";

export type PrivacyCopy = {
  mode: PrivacyMode;
  /** Provider name when cloud, else null. */
  provider: string | null;
  /** Short line for footers/badges. */
  short: string;
  /** Fuller sentence for hero/marketing/feature copy. */
  long: string;
};

/** Resolve the true privacy posture from the environment. Server-side only. */
export function getPrivacyMode(): PrivacyMode {
  return llmProvider() ? "cloud" : "local";
}

const PROVIDER_LABEL: Record<string, string> = {
  groq: "Groq",
  gemini: "Google Gemini",
};

/** The copy that matches reality. Server-side only — pass the result as a prop. */
export function getPrivacyCopy(): PrivacyCopy {
  const provider = llmProvider();
  if (!provider) {
    return {
      mode: "local",
      provider: null,
      short: "Your resume never leaves this device.",
      long: "Private by design — analysis runs entirely on your machine, and your resume is never uploaded to anyone's cloud, including ours.",
    };
  }
  const label = PROVIDER_LABEL[provider] ?? provider;
  return {
    mode: "cloud",
    provider: label,
    short: `Scoring runs locally · AI rewriting uses ${label}.`,
    long: `Scoring, parsing, and ATS analysis run entirely on your machine. AI rewriting is enabled, so resume text is sent to ${label} for those requests only — turn it off by removing the API key to stay fully offline.`,
  };
}

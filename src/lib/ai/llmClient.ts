/**
 * Server-side client for free-tier LLM APIs — the middle tier of the
 * long-planned local → free LLM → bring-your-own-key ladder.
 *
 * Providers (both have genuinely free tiers):
 *   - Groq:   GROQ_API_KEY   (console.groq.com — llama-3.3-70b, very fast)
 *   - Gemini: GEMINI_API_KEY (aistudio.google.com — gemini-2.0-flash)
 *
 * Selection: AI_ENGINE=groq|gemini forces one; otherwise whichever key exists
 * (Groq preferred for speed). No keys → llmProvider() returns null and every
 * caller falls back to the local heuristic engine, so the app never breaks.
 *
 * SERVER ONLY — keys must never reach the browser. All calls go through
 * API routes.
 */

export type LlmProvider = "groq" | "gemini";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-2.0-flash";
const TIMEOUT_MS = 25_000;

/**
 * Explicit UA, sent like the official SDKs do. Node's fetch already sends an
 * acceptable one (verified live: Groq returns 200 with and without), so this is
 * defensive, not a fix — but Groq sits behind Cloudflare, which DOES hard-block
 * some default agents with `403 / error code: 1010` (Python's urllib is blocked
 * that way; see backend/ml/llm_augment.py). Being explicit removes the risk.
 */
const USER_AGENT = "Lumina/1.0";

export function llmProvider(): LlmProvider | null {
  const forced = (process.env.AI_ENGINE || "").toLowerCase();
  if (forced === "groq") return process.env.GROQ_API_KEY ? "groq" : null;
  if (forced === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (forced === "local") return null;
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export type ChatArgs = {
  system: string;
  user: string;
  /**
   * Consent gate. The caller must pass `true` for anything to leave this
   * machine. Undefined/false means local-only — a missing flag can never
   * accidentally ship someone's resume to a third party.
   */
  allowCloud?: boolean;
  /** ask the model for a strict JSON object response */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

async function groqChat(args: ChatArgs): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      model: GROQ_MODEL(),
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      temperature: args.temperature ?? 0.4,
      max_tokens: args.maxTokens ?? 1500,
      ...(args.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new Error("groq: empty response");
  return text;
}

async function geminiChat(args: ChatArgs): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts: [{ text: args.user }] }],
      generationConfig: {
        temperature: args.temperature ?? 0.4,
        maxOutputTokens: args.maxTokens ?? 1500,
        ...(args.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("");
  if (typeof text !== "string" || !text) throw new Error("gemini: empty response");
  return text;
}

/**
 * One chat completion via whichever free provider is configured.
 * Returns null on ANY failure (no key, timeout, rate limit, bad response) —
 * callers always have a local fallback, so failure must be cheap and silent.
 */
export async function llmChat(args: ChatArgs): Promise<{ text: string; provider: LlmProvider } | null> {
  // Consent first: without an explicit opt-in nothing is sent anywhere, even if
  // a provider key is configured.
  if (args.allowCloud !== true) return null;
  const provider = llmProvider();
  if (!provider) return null;
  try {
    const text = provider === "groq" ? await groqChat(args) : await geminiChat(args);
    return { text, provider };
  } catch (err) {
    console.error(`LLM call failed (${provider}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** llmChat + strict JSON parse; strips markdown fences some models add. */
export async function llmJson<T>(args: ChatArgs): Promise<{ data: T; provider: LlmProvider } | null> {
  const res = await llmChat({ ...args, json: true });
  if (!res) return null;
  try {
    const cleaned = res.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    return { data: JSON.parse(cleaned) as T, provider: res.provider };
  } catch {
    console.error("LLM returned non-JSON payload");
    return null;
  }
}

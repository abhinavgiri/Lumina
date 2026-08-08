import { NextRequest } from "next/server";
import { ok, readJson, withApi, badRequest } from "@/lib/api/response";
import { getAiMode, setAiMode, type AiMode } from "@/lib/ai/aiMode";
import { llmProvider } from "@/lib/ai/llmClient";

const PROVIDER_LABEL: Record<string, string> = { groq: "Groq", gemini: "Google Gemini" };

export const GET = withApi("ai.mode.get", async () => {
  const provider = llmProvider();
  return ok({
    mode: await getAiMode(),
    /** Whether a cloud provider is even configured — the UI hides the option otherwise. */
    cloudAvailable: provider !== null,
    providerLabel: provider ? PROVIDER_LABEL[provider] ?? provider : null,
  });
});

export const POST = withApi("ai.mode.set", async (req: NextRequest) => {
  const { mode } = await readJson<{ mode?: string }>(req);
  if (mode !== "local" && mode !== "cloud") throw badRequest("Mode must be 'local' or 'cloud'.");

  // Refuse to record consent for something that can't happen — otherwise the UI
  // would claim cloud processing is on while everything silently ran locally.
  if (mode === "cloud" && !llmProvider()) {
    throw badRequest("No cloud AI provider is configured on this server.");
  }

  await setAiMode(mode as AiMode);
  return ok({ mode });
});

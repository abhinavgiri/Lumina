import { cloudAllowed } from "@/lib/ai/aiMode";
import { NextRequest } from "next/server";
import { structuredResumeSchema } from "@/lib/resumeTypes";
import { polishStructuredResume } from "@/lib/ai/polishResume";
import { badRequest, ok, readJson, withApi } from "@/lib/api/response";

/**
 * Final professional pass over a whole structured resume (used when the AI
 * interview finishes, before saving). Delegates to the shared
 * polishStructuredResume — LLM-backed when a free key is configured, with
 * deterministic casing + graceful local fallback. Never invents facts.
 */
export const POST = withApi("ai.polishResume", async (req: NextRequest) => {
  const body = await readJson(req);
  const parsed = structuredResumeSchema.safeParse(body);
  if (!parsed.success) throw badRequest("Body must be a structured resume.");

  return ok(await polishStructuredResume(parsed.data, await cloudAllowed()));
});

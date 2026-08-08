import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { badRequest, ok, readJson, withApi } from "@/lib/api/response";
import { analyzeResume } from "@/server/services/analysisService";

export const POST = withApi("analyze", async (req: NextRequest) => {
  const userId = await getOrCreateUserId();
  const { resumeId, jdText } = await readJson<{ resumeId?: string; jdText?: string }>(req);

  if (!resumeId) throw badRequest("Missing resumeId.");

  return ok(await analyzeResume(userId, resumeId, jdText));
});

import { cloudAllowed } from "@/lib/ai/aiMode";
import { NextRequest } from "next/server";
import { ok, readJson, withApi } from "@/lib/api/response";
import { enhanceLines } from "@/server/services/aiService";

export const POST = withApi("ai.enhance", async (req: NextRequest) => {
  const { kind, lines, targetRole } = await readJson<{
    kind?: unknown;
    lines?: unknown;
    targetRole?: string;
  }>(req);

  return ok(await enhanceLines(kind, lines, targetRole, await cloudAllowed()));
});

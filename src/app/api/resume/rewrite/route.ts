import { cloudAllowed } from "@/lib/ai/aiMode";
import { NextRequest } from "next/server";
import { ok, readJson, withApi } from "@/lib/api/response";
import { rewriteResumeBullets } from "@/server/services/rewriteService";

export const POST = withApi("resume.rewrite", async (req: NextRequest) => {
  const body = await readJson(req);
  return ok(await rewriteResumeBullets(body, await cloudAllowed()));
});

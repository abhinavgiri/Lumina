import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import { createResumeFromStructured } from "@/server/services/resumeService";

export const POST = withApi("resume.build", async (req: NextRequest) => {
  const body = await readJson(req);
  const userId = await getOrCreateUserId();

  return ok(await createResumeFromStructured(userId, body));
});

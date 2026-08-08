import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import { addInterview, listInterviews } from "@/server/services/careerProfileService";

type Ctx = { params: Promise<{ applicationId: string }> };

export const GET = withApi("interviews.list", async (_req: NextRequest, { params }: Ctx) => {
  const { applicationId } = await params;
  const userId = await getOrCreateUserId();
  return ok({ interviews: await listInterviews(userId, applicationId) });
});

export const POST = withApi("interviews.add", async (req: NextRequest, { params }: Ctx) => {
  const { applicationId } = await params;
  const userId = await getOrCreateUserId();
  const body = await readJson(req);
  return ok(await addInterview(userId, applicationId, body));
});

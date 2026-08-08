import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import { addLearningItem } from "@/server/services/careerProfileService";

export const POST = withApi("profile.learning.add", async (req: NextRequest) => {
  const userId = await getOrCreateUserId();
  const body = await readJson<{ skill?: unknown; source?: unknown; notes?: unknown }>(req);
  return ok(await addLearningItem(userId, body));
});

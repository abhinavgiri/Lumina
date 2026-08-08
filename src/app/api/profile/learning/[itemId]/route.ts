import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import { deleteLearningItem, updateLearningItem } from "@/server/services/careerProfileService";

type Ctx = { params: Promise<{ itemId: string }> };

export const PATCH = withApi("profile.learning.update", async (req: NextRequest, { params }: Ctx) => {
  const { itemId } = await params;
  const userId = await getOrCreateUserId();
  const body = await readJson<{ status?: unknown; notes?: unknown }>(req);
  return ok(await updateLearningItem(userId, itemId, body));
});

export const DELETE = withApi("profile.learning.delete", async (_req: NextRequest, { params }: Ctx) => {
  const { itemId } = await params;
  const userId = await getOrCreateUserId();
  return ok(await deleteLearningItem(userId, itemId));
});

import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import { deleteApplication, updateApplication } from "@/server/services/applicationService";

type Ctx = { params: Promise<{ applicationId: string }> };

export const PATCH = withApi("applications.update", async (req: NextRequest, { params }: Ctx) => {
  const { applicationId } = await params;
  const userId = await getOrCreateUserId();
  const body = await readJson<{ status?: unknown; notes?: unknown }>(req);
  return ok(await updateApplication(userId, applicationId, body));
});

export const DELETE = withApi("applications.delete", async (_req: NextRequest, { params }: Ctx) => {
  const { applicationId } = await params;
  const userId = await getOrCreateUserId();
  return ok(await deleteApplication(userId, applicationId));
});

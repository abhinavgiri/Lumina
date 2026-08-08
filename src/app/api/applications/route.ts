import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { getUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import {
  applicationStats,
  createApplication,
  listApplications,
  type CreateApplicationInput,
} from "@/server/services/applicationService";

export const GET = withApi("applications.list", async (req: NextRequest) => {
  const userId = await getUserId();
  // No session yet means nothing has been saved yet — an empty pipeline, not an
  // error. Avoids creating a user row just because the dashboard mounted.
  if (!userId) {
    return ok({
      applications: [],
      total: 0,
      hasMore: false,
      stats: { total: 0, byStatus: { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 }, interviewRate: null },
    });
  }
  const params = new URL(req.url).searchParams;
  const [page, stats] = await Promise.all([
    listApplications(userId, {
      limit: Number(params.get("limit")) || undefined,
      offset: Number(params.get("offset")) || undefined,
    }),
    applicationStats(userId),
  ]);
  return ok({ applications: page.items, total: page.total, hasMore: page.hasMore, stats });
});

export const POST = withApi("applications.create", async (req: NextRequest) => {
  const userId = await getOrCreateUserId();
  const body = await readJson<CreateApplicationInput>(req);
  return ok(await createApplication(userId, body));
});

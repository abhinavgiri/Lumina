import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import { searchJobsForUser } from "@/server/services/jobService";

export const POST = withApi("jobs.search", async (req: NextRequest) => {
  const userId = await getOrCreateUserId();
  const body = await readJson<{ resumeId?: string; query?: string; location?: string }>(req);

  return ok(await searchJobsForUser(userId, body));
});

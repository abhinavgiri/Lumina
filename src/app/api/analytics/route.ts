import { getUserId } from "@/lib/session";
import { ok, withApi } from "@/lib/api/response";
import { getAnalytics } from "@/server/services/analyticsService";

export const GET = withApi("analytics", async () => {
  const userId = await getUserId();
  // No session yet means no history to analyse — an empty summary, not an error,
  // and no user row created just because the dashboard mounted.
  if (!userId) {
    return ok({
      scoreTrend: { points: [], latest: null, best: null, delta: null },
      recurringGaps: [],
      applications: {
        total: 0,
        byStatus: { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 },
        interviewRate: null,
      },
      analysedJobDescriptions: 0,
      totalAnalyses: 0,
    });
  }
  return ok(await getAnalytics(userId));
});

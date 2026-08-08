import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { badRequest, ok, readJson, withApi } from "@/lib/api/response";
import { generateRoadmap } from "@/server/services/analysisService";

export const POST = withApi("roadmap", async (req: NextRequest) => {
  const userId = await getOrCreateUserId();
  const { atsReportId } = await readJson<{ atsReportId?: string }>(req);

  if (!atsReportId) throw badRequest("Missing atsReportId.");

  return ok({ roadmap: await generateRoadmap(userId, atsReportId) });
});

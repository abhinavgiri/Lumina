import { cloudAllowed } from "@/lib/ai/aiMode";
import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, withApi } from "@/lib/api/response";
import { polishResume } from "@/server/services/resumeService";

export const POST = withApi(
  "resume.polish",
  async (_req: NextRequest, { params }: { params: Promise<{ resumeId: string }> }) => {
    const { resumeId } = await params;
    const userId = await getOrCreateUserId();

    return ok(await polishResume(userId, resumeId, await cloudAllowed()));
  }
);

import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import { tailorResume, type TailorInput } from "@/server/services/tailorService";

export const POST = withApi("resume.tailor", async (req: NextRequest) => {
  const userId = await getOrCreateUserId();
  const body = await readJson<Partial<TailorInput>>(req);

  return ok(
    await tailorResume(userId, {
      resumeId: body.resumeId ?? "",
      jobDescId: body.jobDescId,
      jdText: body.jdText,
    })
  );
});

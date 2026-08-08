import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/session";
import { badRequest, ok, withApi } from "@/lib/api/response";
import { createResumeFromFile } from "@/server/services/resumeService";

export const POST = withApi("resume.upload", async (req: NextRequest) => {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) throw badRequest("No file uploaded.");

  const userId = await getOrCreateUserId();
  return ok(await createResumeFromFile(userId, file));
});

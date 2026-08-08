import { NextRequest } from "next/server";
import { getOrCreateUserId, getUserId } from "@/lib/session";
import { ok, readJson, withApi } from "@/lib/api/response";
import {
  getCareerProfile,
  syncSkillsFromResumes,
  updateCareerProfile,
} from "@/server/services/careerProfileService";

export const GET = withApi("profile.get", async () => {
  const userId = await getUserId();
  // No session means nothing to profile yet — an empty shape, not an error, and
  // no user row created just because the dashboard mounted.
  if (!userId) {
    return ok({
      targetRoles: [],
      seniority: null,
      preferredLocation: null,
      openToRemote: true,
      skills: [],
      learning: [],
      recentlyAdded: [],
    });
  }
  // Keep the skill history current with whatever resumes exist.
  await syncSkillsFromResumes(userId);
  return ok(await getCareerProfile(userId));
});

export const PATCH = withApi("profile.update", async (req: NextRequest) => {
  const userId = await getOrCreateUserId();
  const body = await readJson(req);
  return ok(await updateCareerProfile(userId, body));
});

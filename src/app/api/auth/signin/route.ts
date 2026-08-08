import { NextRequest } from "next/server";
import { ok, readJson, withApi } from "@/lib/api/response";
import { signIn } from "@/server/services/authService";

export const POST = withApi("auth.signin", async (req: NextRequest) => {
  const { email, password } = await readJson<{ email?: string; password?: string }>(req);
  return ok(await signIn(email, password));
});

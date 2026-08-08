import { ok, withApi } from "@/lib/api/response";
import { signOut } from "@/server/services/authService";

export const POST = withApi("auth.signout", async () => {
  await signOut();
  return ok({ signedOut: true });
});

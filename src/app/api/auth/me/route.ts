import { ok, withApi } from "@/lib/api/response";
import { me } from "@/server/services/authService";

export const GET = withApi("auth.me", async () => ok({ user: await me() }));

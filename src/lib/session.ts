/**
 * Session handling.
 *
 * SECURITY NOTE — what changed and why: the cookie used to contain the raw user
 * id, unsigned. Anyone who set `resume_ats_uid` to another user's cuid simply
 * became that user, so any id that leaked (a log line, an error message, a
 * screenshot) was a full account takeover. Now the cookie carries a 256-bit
 * random token, only its SHA-256 hash is stored, and sessions are rows that can
 * expire and be revoked.
 *
 * The product promise is unchanged: no sign-up is required. A visitor still gets
 * an anonymous user on first use; an account is optional and, when claimed,
 * keeps the work they already did (see server/services/authService.ts).
 */
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/crypto";

const SESSION_COOKIE = "lumina_session";
const SESSION_DAYS = 365;

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: maxAgeSeconds,
  path: "/",
});

function expiryDate(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

/** Look up the live session for the current cookie, or null. */
async function currentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    // Expired: clean it up rather than leaving dead rows behind.
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session;
}

/** Read-only lookup for Server Components, where cookies() cannot be mutated. */
export async function getUserId(): Promise<string | null> {
  return (await currentSession())?.userId ?? null;
}

/** The full user for the current session (null when signed out / no session). */
export async function getCurrentUser() {
  const session = await currentSession();
  return session?.user ?? null;
}

/** Issue a session for a user and set the cookie. Route Handlers / Actions only. */
export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  await prisma.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt: expiryDate() },
  });
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60));
}

/**
 * Replace the current session with a fresh one for `userId`.
 * Rotating on sign-in/sign-up prevents session fixation.
 */
export async function rotateSession(userId: string): Promise<void> {
  await destroySession();
  await createSession(userId);
}

/** Delete the current session server-side and clear the cookie. */
export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashSessionToken(token) } })
      .catch(() => {});
  }
  store.set(SESSION_COOKIE, "", cookieOptions(0));
}

/**
 * The zero-friction entry point: return the current user, creating an anonymous
 * one on first visit. Use only in Route Handlers / Server Actions (it sets a
 * cookie).
 */
export async function getOrCreateUserId(): Promise<string> {
  const existing = await getUserId();
  if (existing) return existing;

  const user = await prisma.user.create({ data: {} });
  await createSession(user.id);
  return user.id;
}

/**
 * Auth Service — optional accounts on top of anonymous-first sessions.
 *
 * The product promise is "no sign-up required", so the default path stays
 * anonymous. An account is an UPGRADE, and the upgrade must not lose the work
 * someone already did:
 *
 *   sign up while anonymous  -> CLAIM the current anonymous user in place
 *                               (same id, so every resume/report carries over)
 *   sign in while anonymous  -> switch to the real account, and MOVE any work
 *                               done anonymously onto it, then drop the empty
 *                               anonymous user
 *
 * Both flows rotate the session token, which prevents session fixation.
 */
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/api/response";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/crypto";
import { getCurrentUser, rotateSession, destroySession } from "@/lib/session";

export type PublicUser = { id: string; email: string | null; isAnonymous: boolean };

const toPublic = (u: { id: string; email: string | null; passwordHash: string | null }): PublicUser => ({
  id: u.id,
  email: u.email,
  isAnonymous: u.passwordHash === null,
});

/** Normalize so "A@B.com " and "a@b.com" are the same account. */
function normalizeEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  // Deliberately permissive: a strict RFC regex rejects valid addresses. The
  // real check is that the user can act on the account, not the shape.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest("Enter a valid email address.");
  }
  return email;
}

function validatePassword(raw: unknown): string {
  const password = String(raw ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return password;
}

/**
 * Create an account. When the visitor is currently anonymous, their existing
 * user row is claimed in place so nothing they've built is lost.
 */
export async function signUp(rawEmail: unknown, rawPassword: unknown): Promise<PublicUser> {
  const email = normalizeEmail(rawEmail);
  const password = validatePassword(rawPassword);

  if (await prisma.user.findUnique({ where: { email } })) {
    throw badRequest("An account with this email already exists. Try signing in.");
  }

  const passwordHash = await hashPassword(password);
  const current = await getCurrentUser();

  // Claim the anonymous account in place — same id, so resumes/reports carry over.
  const user =
    current && current.passwordHash === null
      ? await prisma.user.update({ where: { id: current.id }, data: { email, passwordHash } })
      : await prisma.user.create({ data: { email, passwordHash } });

  await rotateSession(user.id);
  return toPublic(user);
}

/**
 * Sign in to an existing account. Any work done anonymously in this browser is
 * moved onto the account rather than being orphaned — otherwise a user who
 * uploaded a resume and then signed in would watch it vanish.
 */
export async function signIn(rawEmail: unknown, rawPassword: unknown): Promise<PublicUser> {
  const email = normalizeEmail(rawEmail);
  const password = String(rawPassword ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message either way so this can't be used to enumerate accounts.
  const invalid = badRequest("Incorrect email or password.");
  if (!user?.passwordHash) throw invalid;
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

  const current = await getCurrentUser();
  if (current && current.passwordHash === null && current.id !== user.id) {
    await migrateAnonymousWork(current.id, user.id);
  }

  await rotateSession(user.id);
  return toPublic(user);
}

/** Move an anonymous user's data onto a real account, then delete the empty shell. */
async function migrateAnonymousWork(fromUserId: string, toUserId: string): Promise<void> {
  await prisma.$transaction([
    prisma.resume.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } }),
    prisma.jobDesc.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } }),
    // Cascades delete the anonymous user's now-empty sessions.
    prisma.user.delete({ where: { id: fromUserId } }),
  ]);
}

/** Sign out. The next request simply gets a fresh anonymous session. */
export async function signOut(): Promise<void> {
  await destroySession();
}

/** Who am I? Used by the UI to decide what to render. */
export async function me(): Promise<PublicUser | null> {
  const user = await getCurrentUser();
  return user ? toPublic(user) : null;
}

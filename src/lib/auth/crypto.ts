/**
 * Password hashing and session-token primitives.
 *
 * Deliberately uses only Node's built-in `crypto` — no bcrypt/argon2 native
 * dependency. scrypt is memory-hard and is what Node ships for exactly this
 * purpose, which keeps the project installable anywhere (including the Docker
 * image and anyone self-hosting) with zero extra build steps.
 *
 * SERVER ONLY.
 */
import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * OWASP-recommended scrypt parameters (N=2^16, r=8, p=1). maxmem must be raised
 * above Node's 32MB default or scrypt throws at this N (needs ~128*N*r ≈ 64MB).
 */
const PARAMS = { N: 2 ** 16, r: 8, p: 1, maxmem: 128 * 2 ** 16 * 8 * 2 };
const KEYLEN = 64;
const SALT_BYTES = 16;

/** Minimum password length. Deliberately length-first: long beats complex. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Hash a password into a self-describing string:
 *   scrypt$N$r$p$<salt-hex>$<hash-hex>
 * Storing the parameters means they can be raised later without invalidating
 * existing hashes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Verify a password against a stored hash. Always compares in constant time,
 * and never throws on malformed input — a bad record is simply a failed login.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * A new session token. 256 bits of CSPRNG output — not guessable, and never
 * derived from the user id (the old cookie WAS the user id, so anyone who
 * learned an id could impersonate that user).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * What we actually store. Only the hash lives in the database, so a dump of the
 * Session table cannot be replayed as valid cookies. SHA-256 (not scrypt) is
 * correct here: the input is already high-entropy, and this runs on every
 * request, so it must stay fast.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

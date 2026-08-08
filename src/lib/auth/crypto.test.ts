/**
 * Tests for the auth primitives.
 *
 * These assert SECURITY properties, not just happy paths: hashes must be
 * salted, verification must reject wrong input without throwing, and session
 * tokens must be unguessable and never derived from anything user-visible.
 */
import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "@/lib/auth/crypto";

describe("hashPassword / verifyPassword", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password in the hash", async () => {
    const hash = await hashPassword("hunter2-hunter2");
    expect(hash).not.toContain("hunter2");
  });

  it("salts: the same password hashes differently every time", async () => {
    const a = await hashPassword("same password here");
    const b = await hashPassword("same password here");
    expect(a).not.toBe(b);
    // …but both still verify, so the salt is stored with the hash.
    expect(await verifyPassword("same password here", a)).toBe(true);
    expect(await verifyPassword("same password here", b)).toBe(true);
  });

  it("records its parameters so they can be raised later", async () => {
    const [scheme, n, r, p] = (await hashPassword("password123")).split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(2 ** 16);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });

  it("returns false rather than throwing on a malformed stored hash", async () => {
    for (const bad of ["", "garbage", "scrypt$$$$", "bcrypt$1$2$3$aa$bb", "scrypt$x$y$z$zz$zz"]) {
      expect(await verifyPassword("whatever", bad)).toBe(false);
    }
  });

  it("normalizes unicode so the same typed password always matches", async () => {
    // "é" composed vs decomposed — different bytes, same character.
    const hash = await hashPassword("cafépassword");
    expect(await verifyPassword("cafépassword", hash)).toBe(true);
  });

  it("requires a sensible minimum length", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });
});

describe("session tokens", () => {
  it("are unique and high-entropy", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken));
    expect(tokens.size).toBe(200);
    // 32 random bytes in base64url ≈ 43 chars.
    expect(generateSessionToken().length).toBeGreaterThanOrEqual(43);
  });

  it("are URL-safe (no cookie-breaking characters)", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateSessionToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("hash deterministically, and the hash does not reveal the token", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toContain(token);
    expect(hashSessionToken(token)).toHaveLength(64); // sha256 hex
  });

  it("gives different hashes for different tokens", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(
      hashSessionToken(generateSessionToken())
    );
  });
});

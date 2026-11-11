import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether the admin password was given. Constant-time, so the response time
 * says nothing about how much of a guess was right, and never true for an
 * empty password: with ADMIN_PASSWORD set to "" by mistake, an empty field
 * used to sign in (security review, October 2026). Both sides are hashed
 * first, so their lengths can differ.
 */
export function passwordMatches(given: unknown, expected: string | undefined): boolean {
  if (typeof given !== "string" || !given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

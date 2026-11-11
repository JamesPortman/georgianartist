import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a request is Vercel Cron's: `Authorization: Bearer <CRON_SECRET>`.
 *
 * Fails closed. The four cron routes used to check `if (secret && …)`, so a
 * deployment without CRON_SECRET (a renamed variable, a new environment)
 * would have let anyone publish an approved Instagram post early, start
 * backups or run the health check. Found by the October 2026 security
 * review (docs/security-review-2026-10.md). Both sides are hashed first so
 * the comparison takes the same time whatever was sent.
 */
export function isCronRequest(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const sent = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(sent, expected);
}

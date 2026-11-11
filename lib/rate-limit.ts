import { prisma } from "@/lib/db";
import { limitKey, type Limit } from "@/lib/form-rate-limit";

/**
 * The admin login limiter: five failed attempts per client IP, then a
 * fifteen-minute lockout.
 *
 * It lives in the FormRateLimit table, so it holds across every serverless
 * instance. Until September 2026 it was a Map in one instance's memory, which
 * only ever slowed a brute-force attempt that happened to land on the same
 * instance. The key is an HMAC of the address (limitKey), never the address.
 *
 * Failures are what count, not attempts: the E2E suite signs in dozens of
 * times in a quarter of an hour from one address, and so might an admin.
 * A successful login clears the counter.
 *
 * Fails open: if the database can't be reached the login goes ahead, because
 * the admin locked out of a broken site is the person who has to fix it. The
 * window that opens is brute force during a database outage, which the
 * password's length has to cover on its own.
 */

export const LOGIN_LIMIT: Limit = { max: 5, windowSec: 15 * 60 };

export function loginKey(ip: string): string {
  return limitKey("ip:login", ip);
}

/** Is this address locked out right now? */
export async function isRateLimited(key: string): Promise<{ blocked: boolean; retryAfterSec: number }> {
  try {
    const rows = await prisma.$queryRaw<{ count: number; ageSec: number }[]>`
      SELECT "count", EXTRACT(EPOCH FROM now() - "windowStart")::int AS "ageSec"
      FROM "FormRateLimit" WHERE "key" = ${key}`;
    const row = rows[0];
    if (!row || Number(row.ageSec) >= LOGIN_LIMIT.windowSec || Number(row.count) < LOGIN_LIMIT.max) {
      return { blocked: false, retryAfterSec: 0 };
    }
    return { blocked: true, retryAfterSec: LOGIN_LIMIT.windowSec - Number(row.ageSec) };
  } catch (e) {
    console.error("[rate-limit] limiter unavailable, allowing login", e);
    return { blocked: false, retryAfterSec: 0 };
  }
}

/** Count a failed attempt, starting (or extending) the window. */
export async function recordFailure(key: string): Promise<void> {
  try {
    // The same one-statement upsert the forms use: increments, or restarts an
    // expired window.
    await prisma.$queryRaw`
      INSERT INTO "FormRateLimit" ("key", "windowStart", "count")
      VALUES (${key}, now(), 1)
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "FormRateLimit"."windowStart" < now() - make_interval(secs => ${LOGIN_LIMIT.windowSec}::double precision)
          THEN 1 ELSE "FormRateLimit"."count" + 1 END,
        "windowStart" = CASE
          WHEN "FormRateLimit"."windowStart" < now() - make_interval(secs => ${LOGIN_LIMIT.windowSec}::double precision)
          THEN now() ELSE "FormRateLimit"."windowStart" END`;
  } catch (e) {
    console.error("[rate-limit] could not record a failed login", e);
  }
}

/** Clear the counter (on a successful login). */
export async function clearFailures(key: string): Promise<void> {
  try {
    await prisma.formRateLimit.deleteMany({ where: { key } });
  } catch {
    // Nothing to do; an expired window clears itself.
  }
}

export const RATE_LIMIT_MAX = LOGIN_LIMIT.max;

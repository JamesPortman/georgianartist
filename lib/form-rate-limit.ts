import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { clientIp } from "@/lib/client-ip";
import { sendAlert } from "@/lib/notify";

/**
 * Rate limits for the public forms, held in Postgres so they apply across
 * every serverless instance — unlike the admin login limiter in
 * lib/rate-limit.ts, which lives in one instance's memory.
 *
 * Why the forms need one: each of them emails a confirmation to whatever
 * address is typed in, from the site's own domain. Without a limit that is a
 * free, SPF- and DKIM-passing mail relay. Three limits, each for a different
 * attacker:
 *
 *   per IP, per form     one client hammering one form
 *   per recipient        many clients aiming confirmations at one victim
 *   global, per day      a distributed run that stays under both of the above
 *
 * An IP over its limit gets a 429 and nothing is sent. The recipient and
 * global limits only hold back the *confirmation*: the enquiry still reaches
 * the owner, because a real customer who retries must not be lost.
 *
 * Keys are HMACs, never raw values — the site promises it stores no visitor
 * IP addresses, and an email address is no better.
 */

export const LIMITS = {
  /** Submissions per IP, per form. Real customers send one, maybe two. */
  perIp: { max: 5, windowSec: 10 * 60 },
  /** Confirmation emails to one address, across all forms. */
  perRecipient: { max: 3, windowSec: 24 * 60 * 60 },
  /** Confirmation emails sent in total — far above real volume. */
  global: { max: 100, windowSec: 24 * 60 * 60 },
  /**
   * Enquiries emailed to the owner in total, across every form. The per-IP
   * limit alone allowed some 2,000 a day from one address, and more from a
   * range of them: enough to bury the inbox and spend the email provider's
   * quota, so that real enquiries failed (security review, October 2026).
   */
  ownerDaily: { max: 150, windowSec: 24 * 60 * 60 },
} as const;

export type Limit = { max: number; windowSec: number };

/** A stable, non-reversible key for a value. */
export function limitKey(scope: string, value: string): string {
  const secret = process.env.SESSION_SECRET || "form-rate-limit";
  const digest = createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");
  return `${scope}:${digest.slice(0, 32)}`;
}

/**
 * Count one hit against `key` and report whether it is within `limit`.
 *
 * One statement: an INSERT that, on conflict, either increments the count or
 * restarts the window if it has expired. Upserts through Prisma need a
 * transaction, which the Neon HTTP adapter doesn't offer; a single raw
 * statement does not.
 */
export async function hit(key: string, limit: Limit): Promise<boolean> {
  return (await hitCount(key, limit)) <= limit.max;
}

/** Count one hit against `key`; the count in the current window, this one included. */
export async function hitCount(key: string, limit: Limit): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "FormRateLimit" ("key", "windowStart", "count")
    VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "FormRateLimit"."windowStart" < now() - make_interval(secs => ${limit.windowSec}::double precision)
        THEN 1 ELSE "FormRateLimit"."count" + 1 END,
      "windowStart" = CASE
        WHEN "FormRateLimit"."windowStart" < now() - make_interval(secs => ${limit.windowSec}::double precision)
        THEN now() ELSE "FormRateLimit"."windowStart" END
    RETURNING "count"`;
  return Number(rows[0]?.count ?? 0);
}

/**
 * The per-IP check for a form. Fails open: if the database can't be reached,
 * a real enquiry still goes through — losing a sale to an outage is worse
 * than one unthrottled request.
 */
export async function allowSubmission(form: string): Promise<boolean> {
  try {
    return await hit(limitKey(`ip:${form}`, await clientIp()), LIMITS.perIp);
  } catch (e) {
    console.error(`[form-rate-limit] ${form}: limiter unavailable, allowing`, e);
    return true;
  }
}

/**
 * The inbox an address delivers to, for counting: "Jane+1@Gmail.com" and
 * "j.a.n.e+2@googlemail.com" are one person's inbox, and counting them apart
 * let anyone send one victim a confirmation per variant (security review,
 * October 2026). The +tag is dropped everywhere; dots only at Gmail, the one
 * provider known to ignore them.
 */
export function mailbox(address: string): string {
  const [local = "", domain = ""] = address.trim().toLowerCase().split("@");
  let user = local.split("+")[0] ?? "";
  let host = domain;
  if (host === "gmail.com" || host === "googlemail.com") {
    user = user.replace(/\./g, "");
    host = "gmail.com";
  }
  return `${user}@${host}`;
}

/**
 * Whether to send the visitor a confirmation. Fails closed: a confirmation is
 * a courtesy, and the abuse this guards against is sending exactly these.
 */
export async function allowConfirmation(recipient: string): Promise<boolean> {
  try {
    const recipientOk = await hit(limitKey("to", mailbox(recipient)), LIMITS.perRecipient);
    const globalOk = await hit("global:confirmations", LIMITS.global);
    return recipientOk && globalOk;
  } catch (e) {
    console.error("[form-rate-limit] limiter unavailable, skipping confirmation", e);
    return false;
  }
}

/**
 * Whether one more enquiry may be emailed to the owner today. The first one
 * over the limit emails a single alert instead. Fails open, like
 * allowSubmission: a limiter outage must not lose a real enquiry.
 */
export async function allowOwnerEmail(form: string): Promise<boolean> {
  const { max } = LIMITS.ownerDaily;
  try {
    const count = await hitCount("global:owner", LIMITS.ownerDaily);
    if (count === max + 1) {
      await sendAlert(
        "Form limit reached: enquiries paused for the day",
        `The site has emailed you ${max} enquiries in the last 24 hours, far more than real visitors send, so it has stopped sending more until the window rolls over. The latest was a ${form} form.\n\nSomeone is probably flooding the forms. Visitors who try now see the phone and email fallbacks.`
      ).catch((e) => console.error("[form-rate-limit] alert failed", e));
    }
    return count <= max;
  } catch (e) {
    console.error(`[form-rate-limit] ${form}: owner limiter unavailable, allowing`, e);
    return true;
  }
}

export const TOO_MANY = {
  error: "Too many requests from here. Please try again in a few minutes.",
};

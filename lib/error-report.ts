import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendAlert } from "@/lib/notify";

/**
 * Server errors, reported by Next through instrumentation.ts. The site has no
 * error-tracking vendor; what it has is one owner and an inbox, so each kind
 * of error is counted in ErrorReport and emailed once a day at most — the
 * first time it happens, and again if it is still happening a day later.
 *
 * One raw statement, like the other counters: an upsert through Prisma needs
 * a transaction the Neon HTTP adapter doesn't have. The statement also claims
 * the alert (sets alertedAt) in the same write, so two instances reporting the
 * same error at once can't both email.
 *
 * Nothing here may throw: this runs inside Next's error handling, and an
 * error while reporting an error must not take the response down with it.
 *
 * The first occurrence stores a fragment of the stack, so the row itself says
 * where it threw; later occurrences keep it rather than overwrite it.
 */

export const ALERT_EVERY_SEC = 24 * 60 * 60;

/** How much of the stack the row keeps, and the email shows. */
export const STACK_MAX_CHARS = 2000;

export type ErrorContext = { path: string; kind: string };

export function errorDigest(err: unknown): string {
  const d = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : "";
  if (d) return d;
  return createHash("sha256").update(errorMessage(err)).digest("hex").slice(0, 16);
}

export function errorMessage(err: unknown): string {
  const m = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return m.slice(0, 500);
}

/** The top of the stack, capped; null when the thrown value has none. */
export function errorStack(err: unknown): string | null {
  if (!(err instanceof Error) || !err.stack) return null;
  return err.stack.slice(0, STACK_MAX_CHARS);
}

/** Records the error; returns true if this call claimed the alert. */
export async function recordError(err: unknown, ctx: ErrorContext): Promise<boolean> {
  const digest = errorDigest(err);
  const rows = await prisma.$queryRaw<{ alerted: boolean }[]>`
    INSERT INTO "ErrorReport" ("digest", "message", "path", "kind", "stack", "count", "firstSeen", "lastSeen", "alertedAt")
    VALUES (${digest}, ${errorMessage(err)}, ${ctx.path.slice(0, 512)}, ${ctx.kind}, ${errorStack(err)}, 1, now(), now(), now())
    ON CONFLICT ("digest") DO UPDATE SET
      "count" = "ErrorReport"."count" + 1,
      "stack" = COALESCE("ErrorReport"."stack", EXCLUDED."stack"),
      "lastSeen" = now(),
      "alertedAt" = CASE
        WHEN "ErrorReport"."alertedAt" IS NULL
          OR "ErrorReport"."alertedAt" < now() - make_interval(secs => ${ALERT_EVERY_SEC}::double precision)
        THEN now() ELSE "ErrorReport"."alertedAt" END
    RETURNING ("alertedAt" = now()) AS alerted`;
  return rows[0]?.alerted === true;
}

/** Undo recordError's claim on the alert, when no email was sent after all. */
async function releaseAlert(digest: string): Promise<void> {
  await prisma.$executeRaw`UPDATE "ErrorReport" SET "alertedAt" = NULL WHERE "digest" = ${digest}`;
}

/**
 * Record and, if it's this kind's first time today, email the owner.
 *
 * `mayAlert` is asked only when this call has claimed the alert, and can veto
 * the email: browser reports (app/api/client-error) are anyone's to send, and
 * each new message is a new kind, so their emails are capped in total.
 */
export async function reportError(
  err: unknown,
  ctx: ErrorContext,
  mayAlert: () => Promise<boolean> = async () => true
): Promise<void> {
  try {
    if (!(await recordError(err, ctx))) return;
    if (!(await mayAlert())) {
      // Vetoed: give the claim back, or this kind would stay "alerted" for a
      // day without an email ever being sent (security review, October 2026).
      await releaseAlert(errorDigest(err));
      return;
    }
    await sendAlert(
      `Error on ${ctx.path}`,
      [
        `A ${ctx.kind} on ${ctx.path} threw:`,
        "",
        errorMessage(err),
        "",
        `Digest ${errorDigest(err)}. Repeats are counted in ErrorReport and not emailed again for a day.`,
        errorStack(err) ? `\n${errorStack(err)}` : "",
      ].join("\n")
    );
  } catch (e) {
    // The database or Resend is down too. The original error is already in
    // Vercel's logs; that has to do.
    console.error("[error-report] could not record", errorMessage(err), e);
  }
}

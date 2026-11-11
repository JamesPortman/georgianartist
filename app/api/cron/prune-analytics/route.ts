import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Daily analytics retention sweep (Vercel Cron — see vercel.json).
 * Deletes raw AnalyticsEvent rows older than 25 months to keep the table lean,
 * and form rate-limit counters older than a day — the longest window in
 * lib/form-rate-limit.ts, so nothing still counting is removed.
 * Each deleteMany is a single statement, so it's safe over the Neon HTTP adapter.
 * Set CRON_SECRET in Vercel to restrict who can trigger it.
 */
// 25 months: two full years to compare a season with the same one last year,
// plus a month's grace, and the ceiling France's CNIL sets for audience
// measurement data. It was three years, longer than anything here uses.
const RETENTION_DAYS = 760; // ~25 months of raw events
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.analyticsEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const { count: limits } = await prisma.formRateLimit.deleteMany({
      where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    // CSP violations nobody has triggered for a month (app/api/csp-report).
    const { count: cspRows } = await prisma.cspViolation.deleteMany({
      where: { lastSeen: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });
    return NextResponse.json({
      ok: true,
      deleted: count,
      cutoff: cutoff.toISOString(),
      rateLimitRowsDeleted: limits,
      cspViolationRowsDeleted: cspRows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

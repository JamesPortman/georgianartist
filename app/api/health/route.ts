import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkDatabase } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Public health endpoint for the external uptime monitor (Better Stack, free
 * plan, every three minutes). 200 when the database answers with a non-empty
 * catalogue, 503 when it doesn't.
 *
 * Why it exists: the free plan only checks that a URL responds, and when the
 * database is down the site still responds — with its "Something went wrong"
 * page. The keyword check that would catch that is a paid feature. A second
 * monitor pointed here turns a database outage into a failed request. The
 * internal health check (app/api/cron/health) runs on Vercel and can't see
 * Vercel itself go down; this one is watched from outside.
 *
 * It says nothing but ok or not — no counts, no error text. A healthy answer
 * is cached at Vercel's edge for 30 seconds, so a flood of requests can't
 * become a flood of database queries; a failure is never cached, so recovery
 * shows at once.
 */
export async function GET() {
  const db = await checkDatabase(() => prisma.product.count({ where: { visible: true } }));
  return NextResponse.json(
    { ok: db.ok },
    {
      status: db.ok ? 200 : 503,
      headers: {
        // Healthy answers are cached at the edge for 30 minutes. Neon's free plan
        // suspends the database after 5 idle minutes and bills the time it's
        // awake; at 30 s, Better Stack's 3-minute check reached the database
        // every time and kept it awake around the clock (the whole month's 100
        // CU-hours gone by 16 Oct 2026). A database outage is now noticed
        // within 30 minutes; a failure is never cached.
        "Cache-Control": db.ok ? "public, max-age=0, s-maxage=1800" : "no-store",
      },
    }
  );
}

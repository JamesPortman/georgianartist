import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendAlert } from "@/lib/notify";
import { checkDatabase, checkPage, describe, PAGES, transition } from "@/lib/health";
import { siteConfig } from "@/data/siteConfig";
import { productPath } from "@/lib/product-path";
import { isCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Site health check — Vercel Cron, hourly (vercel.json; it was every 10 minutes,
 * which alone kept Neon's database from ever suspending). See
 * lib/health.ts for what it checks and why it emails only on a change.
 *
 * Returns 503 while anything fails, so a failing run is visible in Vercel's
 * logs too.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The live domain by default, so the check covers what a visitor reaches.
  const base = process.env.HEALTH_CHECK_BASE_URL || siteConfig.url;

  const product = await prisma.product
    .findFirst({ where: { visible: true, type: "painting" }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, type: true } })
    .catch(() => null);
  const paths = [...PAGES, ...(product ? [productPath(product)] : [])];

  const checks = await Promise.all([
    checkDatabase(() => prisma.product.count({ where: { visible: true } })),
    ...paths.map((p) => checkPage(base, p)),
  ]);
  const failing = checks.some((c) => !c.ok);
  const report = describe(checks);

  // Record this run and read the previous one in a single statement (the Neon
  // HTTP adapter has no transactions). If the database is down this throws,
  // and the state is "unknown": a failure is then reported rather than risked.
  let was: boolean | null | "unknown" = "unknown";
  let since: Date | null = null;
  try {
    const rows = await prisma.$queryRaw<{ wasFailing: boolean | null; wasSince: Date | null }[]>`
      WITH prev AS (SELECT "failing", "changedAt" FROM "HealthState" WHERE "id" = 'site')
      INSERT INTO "HealthState" ("id", "failing", "changedAt", "checkedAt", "detail")
      VALUES ('site', ${failing}, now(), now(), ${report})
      ON CONFLICT ("id") DO UPDATE SET
        "failing" = EXCLUDED."failing",
        "changedAt" = CASE WHEN "HealthState"."failing" IS DISTINCT FROM EXCLUDED."failing"
                           THEN now() ELSE "HealthState"."changedAt" END,
        "checkedAt" = now(),
        "detail" = EXCLUDED."detail"
      RETURNING (SELECT "failing" FROM prev) AS "wasFailing",
                (SELECT "changedAt" FROM prev) AS "wasSince"`;
    was = rows[0]?.wasFailing ?? null;
    since = rows[0]?.wasSince ?? null;
  } catch (e) {
    console.error("[health] could not record state", e);
  }

  const change = transition(was, failing);
  if (change === "failed") {
    await sendAlert(
      `${siteConfig.brand} health check failing`,
      `One or more checks against ${base} failed at ${new Date().toISOString()}.\n\n${report}\n\n` +
        `You'll get one more email when it recovers, not one every hour.`
    );
  } else if (change === "recovered") {
    const mins = since ? Math.round((Date.now() - new Date(since).getTime()) / 60_000) : null;
    await sendAlert(
      `${siteConfig.brand} health check recovered`,
      `Every check against ${base} passes again${mins !== null ? `, after about ${mins} minutes` : ""}.\n\n${report}`,
      "✅"
    );
  }

  return NextResponse.json({ ok: !failing, change, checks }, { status: failing ? 503 : 200 });
}

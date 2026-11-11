import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseReports } from "@/lib/csp-report";
import { hit, limitKey } from "@/lib/form-rate-limit";
import { clientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

/**
 * Collects Content-Security-Policy violation reports (lib/csp.ts, proxy.ts).
 *
 * Aggregated, not logged one by one: each distinct directive + blocked origin
 * + page is one CspViolation row with a count, so a busy page can't flood the
 * table, and reading it answers "what would enforcing break?" directly.
 * Anyone can POST here, so bodies are capped, clients are rate-limited, and
 * only reports about this site's own pages are kept (lib/csp-report.ts).
 * Always 204: a browser has nothing useful to do with an error.
 */
export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  try {
    const text = await request.text();
    if (text.length > 16_000) return done;

    const allowed = await hit(limitKey("ip:csp", await clientIp()), { max: 60, windowSec: 600 }).catch(
      () => true
    );
    if (!allowed) return done;

    for (const v of parseReports(JSON.parse(text))) {
      const key = createHash("sha256").update(`${v.directive}|${v.blocked}|${v.page}`).digest("hex").slice(0, 40);
      await prisma.$executeRaw`
        INSERT INTO "CspViolation" ("key", "directive", "blocked", "page", "sample", "count", "firstSeen", "lastSeen")
        VALUES (${key}, ${v.directive}, ${v.blocked}, ${v.page}, ${v.sample}, 1, now(), now())
        ON CONFLICT ("key") DO UPDATE SET "count" = "CspViolation"."count" + 1, "lastSeen" = now()`;
    }
  } catch {
    // Malformed JSON or the database unavailable: nothing to do but move on.
  }
  return done;
}

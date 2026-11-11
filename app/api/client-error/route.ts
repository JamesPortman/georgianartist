import { NextResponse } from "next/server";
import { parseClientError, toError } from "@/lib/client-error";
import { reportError } from "@/lib/error-report";
import { hit, limitKey } from "@/lib/form-rate-limit";
import { clientIp } from "@/lib/client-ip";
import { isBot } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** Reports one browser may send in ten minutes. */
export const PER_IP = { max: 10, windowSec: 10 * 60 };
/** Emails about browser errors in a day, across every kind: each new message is a new kind. */
export const ALERTS_PER_DAY = { max: 10, windowSec: 24 * 60 * 60 };

/**
 * Collects errors thrown in visitors' browsers (lib/client-error.ts) into
 * ErrorReport, so a crash in the gift-shop builder or the map reaches the
 * owner the way a server error does. Anyone can POST here: bodies are capped
 * and checked, each address is rate-limited, bots are ignored, and the emails
 * these reports can trigger are capped per day. Always 204: a browser that
 * has just failed has nothing useful to do with an error about its report.
 */
export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });
  try {
    if (isBot(request.headers.get("user-agent"))) return done;
    const report = parseClientError(await request.text());
    if (!report) return done;

    const allowed = await hit(limitKey("ip:client-error", await clientIp()), PER_IP).catch(() => false);
    if (!allowed) return done;

    await reportError(toError(report), { path: report.path, kind: report.kind }, () =>
      hit("all:client-error-alert", ALERTS_PER_DAY).catch(() => false)
    );
  } catch {
    // The database unavailable: the visitor's page has already failed; nothing more to do.
  }
  return done;
}

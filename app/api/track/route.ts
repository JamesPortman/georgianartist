import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { hit, limitKey } from "@/lib/form-rate-limit";
import { writeEvent } from "@/lib/server-event";
import { clientIp } from "@/lib/client-ip";
import {
  ANALYTICS_COOKIE,
  ANALYTICS_COOKIE_MAX_AGE,
  BROWSER_ACTIONS,
  isBot,
  isNonProductionRequest,
  isVisitorId,
  type TrackPayload,
} from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Events accepted per client address, per ten minutes. A real visitor sends
 * one per page plus a few actions; a script could otherwise write unbounded
 * rows and skew the dashboard. Fails open like the forms' per-IP check: a
 * limiter outage must not lose a real visitor's data.
 */
export const TRACK_LIMIT = { max: 120, windowSec: 10 * 60 } as const;

// Built from lib/analytics.ts, so an action the browser can send is an action
// this route accepts. Not "contact_submit" or "buy_submit": a form's outcome is
// recorded by its own route, which knows whether the email went
// (lib/server-event.ts).
const VALID_ACTIONS: ReadonlySet<string> = new Set(BROWSER_ACTIONS);

/**
 * First-party analytics ingest. Called by the browser on every page view and on
 * tracked actions. Enriches the event server-side (UA → device/browser/os,
 * Vercel edge geo headers → country/city), assigns an anonymous visitor cookie,
 * filters bots, and writes a single row. Always returns fast and never throws to
 * the client — tracking must never break the page.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as TrackPayload | null;
    if (!body || (body.kind !== "pageview" && body.kind !== "action")) {
      return new NextResponse(null, { status: 204 });
    }

    const path = typeof body.path === "string" ? body.path.slice(0, 512) : "";
    if (!path || path.startsWith("/admin") || path.startsWith("/api")) {
      // Never record admin or API traffic.
      return new NextResponse(null, { status: 204 });
    }

    const h = await headers();

    // Local dev, a local Playwright run, and preview deployments all share the
    // production database through .env — a suite run locally has already
    // written 131 events into it. Drop them before they become "visitors".
    if (isNonProductionRequest(h.get("host"), process.env.VERCEL_ENV)) {
      return new NextResponse(null, { status: 204 });
    }

    const ua = h.get("user-agent");
    if (isBot(ua)) {
      return new NextResponse(null, { status: 204 });
    }

    const allowed = await hit(limitKey("ip:track", await clientIp()), TRACK_LIMIT).catch(() => true);
    if (!allowed) {
      return new NextResponse(null, { status: 204 });
    }

    // Action events must carry a known action name.
    const action =
      body.kind === "action" && typeof body.action === "string" && VALID_ACTIONS.has(body.action)
        ? body.action
        : null;
    if (body.kind === "action" && !action) {
      return new NextResponse(null, { status: 204 });
    }

    // Anonymous visitor id (first-party cookie). Generate one if absent.
    const cookieStore = await cookies();
    let visitorId = cookieStore.get(ANALYTICS_COOKIE)?.value;
    let setCookie = false;
    if (!isVisitorId(visitorId)) {
      visitorId = crypto.randomUUID();
      setCookie = true;
    }

    // Only keep external referrers (strip our own domain to reduce noise).
    let referrer: string | null = null;
    if (typeof body.referrer === "string" && body.referrer) {
      try {
        const refHost = new URL(body.referrer).hostname;
        if (!/georgianartist\.com$/i.test(refHost) && refHost !== "localhost") {
          referrer = body.referrer.slice(0, 512);
        }
      } catch {
        /* malformed referrer — ignore */
      }
    }

    // The artist's own browsing was the single largest "city" in the dashboard;
    // writeEvent drops excluded browsers (see lib/server-event.ts).
    await writeEvent(
      {
        kind: body.kind,
        action,
        path,
        productId: typeof body.productId === "string" ? body.productId : null,
        referrer,
      },
      visitorId,
      h
    );

    const res = new NextResponse(null, { status: 204 });
    if (setCookie) {
      res.cookies.set(ANALYTICS_COOKIE, visitorId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ANALYTICS_COOKIE_MAX_AGE,
        path: "/",
      });
    }
    return res;
  } catch {
    // Swallow everything — analytics failures must be invisible to visitors.
    return new NextResponse(null, { status: 204 });
  }
}

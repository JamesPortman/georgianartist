import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { ANALYTICS_COOKIE, isBot, isNonProductionRequest, isVisitorId, parseUserAgent } from "@/lib/analytics";

/**
 * Write one AnalyticsEvent row, enriched from the request's headers. Shared by
 * /api/track (what the browser reports) and recordServerAction (what the
 * server knows happened), so both drop excluded browsers the same way.
 *
 * Excluded browsers are dropped here rather than filtered in the dashboard's
 * dozen-odd queries, so no future query can forget to exclude them. A lookup
 * failure must not lose a real visitor's event, so it counts.
 */
export async function writeEvent(
  e: { kind: "pageview" | "action"; action: string | null; path: string; productId?: string | null; referrer?: string | null },
  visitorId: string,
  h: Headers
): Promise<boolean> {
  const excluded = await prisma.excludedVisitor
    .findUnique({ where: { visitorId }, select: { visitorId: true } })
    .catch(() => null);
  if (excluded) return false;

  const { device, browser, os } = parseUserAgent(h.get("user-agent"));
  const cityRaw = h.get("x-vercel-ip-city");
  await prisma.analyticsEvent.create({
    data: {
      kind: e.kind,
      action: e.action,
      path: e.path,
      productId: e.productId ? e.productId.slice(0, 128) : null,
      referrer: e.referrer ?? null,
      visitorId,
      device,
      browser,
      os,
      country: h.get("x-vercel-ip-country") || null,
      city: cityRaw ? decodeURIComponent(cityRaw) : null,
    },
  });
  return true;
}

/** Actions only the server can vouch for. Not accepted from the browser. */
export type ServerAction = "contact_submit" | "buy_submit" | "spam_blocked";

/**
 * Record a form outcome the server itself observed.
 *
 * "Contact form sent" used to be reported by the page whenever /api/contact
 * answered OK -- and the route answers OK to a bot caught by the honeypot,
 * deliberately, so the bot learns nothing. Fourteen bots were counted as
 * contact messages between June and September 2026, none of which sent an
 * email. The reply to the visitor must stay identical, so the page can't tell
 * the difference; only the server can. So the server records it, and only
 * once the owner's email has actually gone.
 *
 * Never throws: analytics must not break a form.
 */
export async function recordServerAction(
  action: ServerAction,
  request: Request,
  fallbackPath: string,
  productId?: string | null
): Promise<void> {
  try {
    const h = await headers();
    if (isNonProductionRequest(h.get("host"), process.env.VERCEL_ENV)) return;
    // A declared crawler filling in a form is still spam worth counting.
    if (action !== "spam_blocked" && isBot(h.get("user-agent"))) return;
    const cookie = (await cookies()).get(ANALYTICS_COOKIE)?.value;
    const visitorId = isVisitorId(cookie) ? cookie : crypto.randomUUID();
    await writeEvent({ kind: "action", action, path: pageOf(request, fallbackPath), productId }, visitorId, h);
  } catch {
    /* swallow */
  }
}

/** The page the form was on, from the Referer header; never an API path. */
export function pageOf(request: Request, fallback: string): string {
  try {
    const ref = request.headers.get("referer");
    const path = ref ? new URL(ref).pathname.slice(0, 512) : "";
    return path && !path.startsWith("/api") && !path.startsWith("/admin") ? path : fallback;
  } catch {
    return fallback;
  }
}

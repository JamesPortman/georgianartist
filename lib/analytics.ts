// First-party analytics helpers — pure functions shared by the ingest route,
// the client tracker, and tests. No dependencies.

/** Name of the anonymous first-party visitor-id cookie. Not PII. */
export const ANALYTICS_COOKIE = "gba_vid";

/**
 * Whether a visitor-id cookie looks like one this site set (a UUID). Anything
 * else, up to a cookie's 4KB, used to be stored as is on every event row, for
 * 25 months (security review, October 2026); the caller makes a fresh id.
 */
export function isVisitorId(value: string | undefined): value is string {
  return !!value && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

/** How long the visitor cookie lives (1 year, in seconds). */
export const ANALYTICS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Event kinds. */
export type EventKind = "pageview" | "action";

/**
 * The action names the browser reports (null for plain pageviews). A form's
 * outcome -- "contact_submit", "buy_submit", "spam_blocked" -- is not one of
 * them: only the server knows whether the email went (lib/server-event.ts).
 */
export const BROWSER_ACTIONS = [
  "buy_open",
  /** Kit accepted the address (double opt-in: not yet confirmed). */
  "newsletter_submit",
  "product_click",
  "outbound_click",
  /** Clicked "Ask about something similar" on a sold-out work's page. */
  "soldout_enquiry",
] as const;

/**
 * One list, not two: /api/track's allow-list is built from this array. It used
 * to be a separate Set in the route, and newsletter_submit and soldout_enquiry
 * were added here but never there, so the route silently dropped every one of
 * them (found 1 Oct 2026).
 */
export type ActionName = (typeof BROWSER_ACTIONS)[number];

/** Payload sent from the browser to /api/track. */
export interface TrackPayload {
  kind: EventKind;
  action?: ActionName;
  path: string;
  productId?: string;
  referrer?: string;
}

export type DeviceType = "mobile" | "tablet" | "desktop";

/** One day's analytics roll-up. Shape shared by server queries + the chart. */
export interface DailyPoint {
  /** ISO date (YYYY-MM-DD), in UTC. */
  date: string;
  views: number;
  visitors: number;
  /** Mean page views over TREND_DAYS days ending on this one (withViewsTrend). */
  viewsTrend?: number;
}

/** Days in the dashboard's moving average: a whole week, so weekday/weekend swings cancel. */
export const TREND_DAYS = 7;

/**
 * Add each day's trailing TREND_DAYS-day mean of page views, then drop the
 * first `leadDays` points.
 *
 * Trailing (that day and the six before it) rather than centred, so the line
 * reaches today instead of stopping three days short. The caller fetches
 * TREND_DAYS - 1 days before the range and passes them as the lead, so the
 * first days of a range average a real week rather than dipping toward zero.
 * Where there are no earlier days (the start of "all time"), a point averages
 * the days that exist.
 */
export function withViewsTrend(series: DailyPoint[], leadDays: number): DailyPoint[] {
  let sum = 0;
  const out = series.map((p, i) => {
    sum += p.views;
    if (i >= TREND_DAYS) sum -= series[i - TREND_DAYS]?.views ?? 0;
    return { ...p, viewsTrend: sum / Math.min(i + 1, TREND_DAYS) };
  });
  return out.slice(leadDays);
}

/** ISO YYYY-MM-DD for a date (UTC). */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Format a current-vs-previous comparison as a delta label + direction. The
 * chart layer turns `up` into a colour / arrow. Returned `up: null` means
 * "unchanged or undefined" (no arrow).
 *
 *   pctChange(120, 100)  → { text: "+20%", up: true }
 *   pctChange(80, 100)   → { text: "-20%", up: false }
 *   pctChange(100, 100)  → { text: "0%",   up: null }
 *   pctChange(5,   0)    → { text: "new",  up: true }
 *   pctChange(0,   0)    → { text: "n/a",  up: null }
 */
export function pctChange(cur: number, prev: number): { text: string; up: boolean | null } {
  if (prev === 0) return { text: cur > 0 ? "new" : "n/a", up: cur > 0 ? true : null };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return { text: "0%", up: null };
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, up: pct > 0 };
}

/**
 * Turn a sparse server result (only days with events) into a dense series with
 * every day in the window represented — gaps fill with zeros so the chart's
 * x-axis doesn't lie. `start` is the inclusive lower bound; `days` is how many
 * day-buckets to emit (range UI: 7 / 30 / 90).
 */
export function fillDailySeries(
  rows: Array<{ day: Date; views: number; visitors: number }>,
  start: Date,
  days: number
): DailyPoint[] {
  const seriesMap = new Map<string, { views: number; visitors: number }>();
  for (const r of rows) {
    seriesMap.set(isoDay(new Date(r.day)), {
      views: Number(r.views),
      visitors: Number(r.visitors),
    });
  }
  const out: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const key = isoDay(d);
    const v = seriesMap.get(key) ?? { views: 0, visitors: 0 };
    out.push({ date: key, views: v.views, visitors: v.visitors });
  }
  return out;
}

export interface ParsedUA {
  device: DeviceType;
  browser: string;
  os: string;
}

/**
 * Lightweight user-agent parsing. Good enough for an admin dashboard — we only
 * need coarse device / browser / OS buckets, not full fingerprinting.
 */
export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  const s = (ua ?? "").toLowerCase();

  // Device
  let device: DeviceType = "desktop";
  if (/ipad|tablet|(android(?!.*mobile))|kindle|silk|playbook/.test(s)) {
    device = "tablet";
  } else if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|iemobile/.test(s)) {
    device = "mobile";
  }

  // Browser (order matters — check more specific tokens first)
  let browser = "Other";
  if (/edg(a|ios|e)?\//.test(s)) browser = "Edge";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/samsungbrowser/.test(s)) browser = "Samsung Internet";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/chrome|crios|chromium/.test(s)) browser = "Chrome";
  else if (/safari/.test(s)) browser = "Safari";

  // OS
  let os = "Other";
  if (/windows/.test(s)) os = "Windows";
  else if (/iphone|ipad|ipod|ios/.test(s)) os = "iOS";
  else if (/mac os x|macintosh/.test(s)) os = "macOS";
  else if (/android/.test(s)) os = "Android";
  else if (/linux/.test(s)) os = "Linux";
  else if (/cros/.test(s)) os = "ChromeOS";

  return { device, browser, os };
}

/**
 * Detect common bots / crawlers / preview fetchers so they don't pollute the
 * human-traffic numbers. Conservative: matches obvious automation tokens.
 */
export function isBot(ua: string | null | undefined): boolean {
  const s = (ua ?? "").toLowerCase();
  if (!s) return true; // no UA → almost always automation
  return /bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|facebot|embedly|quora link preview|outbrain|pinterest\/|developers\.google|google-inspectiontool|chrome-lighthouse|headlesschrome|phantomjs|puppeteer|playwright|python-requests|axios|curl|wget|node-fetch|go-http-client|java\/|httpclient|monitoring|uptimerobot|pingdom|gtmetrix|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|amazonbot|applebot|yandex|baiduspider|duckduckbot|whatsapp|telegrambot|discordbot|slackbot|twitterbot|linkedinbot|preview/.test(
    s
  );
}

/**
 * True for a request that isn't real production traffic — local development,
 * a local Playwright run, or a Vercel preview deployment.
 *
 * 131 events in the table came from none of the above being checked: a
 * Playwright suite run locally against `.env`, which points at the production
 * database. They show up as visitors with no country and no city at all (no
 * Vercel edge in front of localhost) and a fresh visitor id per test, and 110
 * of them landed on a single day. The paths are the giveaway — the E2E
 * fixtures, `/photographs/clarksburg-library` and `/products/singhampton-winter`.
 *
 * Deliberately a DENY-list, not an allow-list of production hostnames. An
 * allow-list fails closed: rename the domain, or let Vercel stop setting
 * VERCEL_ENV, and real traffic silently stops being counted with nothing
 * visibly broken. This way the only thing an unrecognised environment costs is
 * that some test traffic gets counted — the same bias as everywhere else here,
 * that losing a real visitor's event is the worse error.
 *
 * `vercelEnv` is a required argument rather than a default that reads
 * process.env. A default is the obvious shape and it is a trap: calling this
 * with an explicit `undefined` still triggers the default, so the function
 * silently consults the ambient environment. The tests passed locally, where
 * VERCEL_ENV is unset, and failed on Vercel, where the preview build sets it
 * to "preview" — every event dropped, in a test that believed it was passing
 * "no environment". Callers pass it; nothing here reads a global.
 */
export function isNonProductionRequest(
  host: string | null | undefined,
  vercelEnv: string | undefined
): boolean {
  if (vercelEnv === "preview" || vercelEnv === "development") return true;

  // "[::1]:3000" — the bracketed IPv6 form, where splitting on ":" gives "[".
  const raw = (host ?? "").trim().toLowerCase();
  const hostname = raw.startsWith("[")
    ? raw.slice(0, raw.indexOf("]") + 1)
    : raw.split(":")[0];
  if (!hostname) return false; // unknown — count it
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".test")
  );
}

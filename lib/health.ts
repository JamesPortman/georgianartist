import { siteConfig } from "@/data/siteConfig";

/**
 * The site health check behind /api/cron/health (hourly).
 *
 * It checks what visitors depend on — the database answers and has visible
 * work, and real pages render on the live domain — and emails the owner when
 * that changes: once when something breaks, once when it recovers. Not every
 * hour while it stays broken; an alert that repeats gets filtered.
 *
 * It runs on Vercel, so it cannot notice Vercel itself or the domain going
 * down. That needs a monitor somewhere else; see /architecture §10.
 */

export type Check = { name: string; ok: boolean; detail: string; ms: number };

/** Pages that must render. A product page is added from the catalogue. */
export const PAGES = ["/", "/photographs", "/gift-shop"] as const;
export const PAGE_TIMEOUT_MS = 10_000;

async function timed(name: string, fn: () => Promise<string>): Promise<Check> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, ms: Date.now() - start };
  } catch (e) {
    return { name, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Date.now() - start };
  }
}

/** One page: HTTP 200, and the storefront actually rendered (the brand is in the nav). */
export function checkPage(base: string, path: string, fetchImpl: typeof fetch = fetch): Promise<Check> {
  return timed(`page ${path}`, async () => {
    const res = await fetchImpl(new URL(path, base), {
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "user-agent": "georgianartist-health-check" },
      cache: "no-store",
    });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes(siteConfig.brand)) throw new Error("rendered without the storefront");
    return `HTTP 200, ${html.length} bytes`;
  });
}

export function checkDatabase(countVisible: () => Promise<number>): Promise<Check> {
  return timed("database", async () => {
    const n = await countVisible();
    if (n < 1) throw new Error("no visible works in the catalogue");
    return `${n} visible works`;
  });
}

export type Transition = "failed" | "recovered" | null;

/**
 * Whether this run should email. `wasFailing` is the previous run's state:
 * null on the very first run, "unknown" when it couldn't be read (the
 * database is down) — in which case a failure is reported rather than
 * risking silence.
 */
export function transition(wasFailing: boolean | null | "unknown", nowFailing: boolean): Transition {
  if (wasFailing === "unknown") return nowFailing ? "failed" : null;
  if (nowFailing && wasFailing !== true) return "failed";
  if (!nowFailing && wasFailing === true) return "recovered";
  return null;
}

export function describe(checks: Check[]): string {
  return checks
    .map((c) => `${c.ok ? "ok  " : "FAIL"}  ${c.name.padEnd(28)} ${c.detail} (${c.ms} ms)`)
    .join("\n");
}

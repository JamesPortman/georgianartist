/**
 * Errors thrown in visitors' browsers, which instrumentation.ts can't see: a
 * component that crashes while rendering (caught by app/error.tsx or
 * app/global-error.tsx) or a click handler that throws (caught by
 * components/ClientErrorReporter.tsx). They are posted to /api/client-error and
 * recorded beside the server's errors in ErrorReport (lib/error-report.ts).
 *
 * Anyone can post there, so this keeps only a bounded, well-formed report
 * about one of this site's own pages, and drops the noise every site sees:
 * cross-origin "Script error." with no detail, and the ResizeObserver warning
 * browsers raise as an error.
 */

export type ClientErrorReport = { name: string; message: string; stack: string | null; path: string; kind: string };

export const CLIENT_ERROR_KINDS = ["browser (page)", "browser (root)", "browser (event)", "browser (promise)"] as const;

const MAX = { name: 80, message: 500, stack: 2000, path: 200, body: 8_000 };

/** Messages no fix on this site would change. */
const NOISE = [/^script error\.?$/i, /resizeobserver loop/i];

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

export function parseClientError(text: string): ClientErrorReport | null {
  if (text.length > MAX.body) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const message = str(o.message);
  const path = str(o.path);
  const kind = str(o.kind);
  if (!message || NOISE.some((re) => re.test(message))) return null;
  // A path on this site: absolute, no scheme or host, no query (it can carry anything).
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (!(CLIENT_ERROR_KINDS as readonly string[]).includes(kind)) return null;

  const stack = str(o.stack);
  return {
    name: clip(str(o.name) || "Error", MAX.name),
    message: clip(message, MAX.message),
    stack: stack ? clip(stack, MAX.stack) : null,
    path: clip(path.split(/[?#]/)[0] ?? "", MAX.path),
    kind,
  };
}

/** The report as an Error, so it goes through the same digest and storage as a server one. */
export function toError(r: ClientErrorReport): Error {
  const e = new Error(r.message);
  e.name = r.name;
  e.stack = r.stack ?? undefined;
  return e;
}

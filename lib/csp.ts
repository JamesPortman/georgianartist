/**
 * The Content-Security-Policy, built per request by proxy.ts.
 *
 * Nonce-based and strict: a script runs only if it carries this request's
 * nonce, or was loaded by one that did ('strict-dynamic'). There is no host
 * allowlist for scripts and no 'unsafe-inline'. Next.js reads the nonce from
 * the policy header and puts it on its own scripts; the GA4 tags get it from
 * app/layout.tsx. Every page here already renders per request, which is the
 * one real cost of nonces — so it costs this site nothing extra.
 *
 * Enforcing since 28 September 2026. It was sent as Report-Only first, so a
 * wrong guess couldn't break the site: violations went to /api/csp-report and
 * nothing was blocked. On real traffic the table showed only the Vercel
 * toolbar's frame (the owner's own browser, allowed below) and GA's country-
 * domain audience ping (stopped at the source by consent mode, lib/ga.ts).
 * Violations are still reported while enforcing, so CspViolation stays the
 * place to look when something on a page stops working.
 *
 * Deliberate allowances, each for one thing the site does:
 *   style-src 'unsafe-inline'   React renders style="" attributes (next/image
 *                               fill, Leaflet); nonces can't cover attributes.
 *                               Injected CSS is far less dangerous than script.
 *   /admin only:
 *     worker-src blob:          heic2any converts iPhone photos in a Worker
 *     'unsafe-eval'             built from a blob: URL, using new Function.
 *                               The public site gets neither.
 *   frame-src vercel.live       the Vercel toolbar, which Vercel injects for a
 *                               signed-in team member (its script carries the
 *                               page's nonce; the comments panel is a frame).
 *                               Visitors never load it.
 */

export const ENFORCE = true;
export const REPORT_PATH = "/api/csp-report";

const BLOB = "https://*.public.blob.vercel-storage.com";
// GA4's collection endpoints vary by visitor region and by whether Google
// Signals is on. CI (US runners) showed two a Canadian test run never hit:
// the bare analytics.google.com (a *. wildcard doesn't cover the bare host)
// and stats.g.doubleclick.net. Report-only mode exists to surface the rest.
//
// No google.<country> hosts: those serve GA's advertising audience ping, which
// uses the visitor's own country domain and so can't be allowlisted. Consent
// mode denies ad storage instead (lib/ga.ts), which stops it.
//
// GA loads only on the production deployment, so CI's CSP test no longer sees
// these hosts; a new GA endpoint will appear in CspViolation, not in CI.
const GA = [
  "https://*.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://analytics.google.com",
  "https://*.analytics.google.com",
  "https://*.g.doubleclick.net",
];

export function buildCsp({
  nonce,
  isDev = false,
  isAdmin = false,
  upgradeInsecure = false,
}: {
  nonce: string;
  isDev?: boolean;
  isAdmin?: boolean;
  /**
   * Only when enforcing over HTTPS: browsers ignore (and warn about) it in a
   * report-only policy, and on plain-http localhost it would break loads.
   */
  upgradeInsecure?: boolean;
}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // React needs eval in development for its error overlays; production doesn't.
      ...(isDev || isAdmin ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", BLOB, "https://tile.openstreetmap.org", ...GA],
    "media-src": ["'self'", BLOB],
    "font-src": ["'self'"],
    "connect-src": ["'self'", "https://app.kit.com", ...GA],
    "frame-src": ["https://www.openstreetmap.org", "https://vercel.live"],
    "worker-src": ["'self'", ...(isAdmin ? ["blob:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    // report-uri alone, not report-to: when a policy names both, Chrome uses
    // only report-to (the Reporting API), which batches and — in testing here,
    // headless and in a real embedded Chromium — never delivered at all.
    // report-uri is deprecated but supported everywhere and sent at once.
    "report-uri": [REPORT_PATH],
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (upgradeInsecure) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** A fresh, unguessable nonce for one request. */
export function makeNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * HTTP security headers sent on every response (next.config.ts).
 *
 * Until these, the site sent only Vercel's default HSTS. Each one closes a
 * specific gap a scanner or reviewer checks first:
 *
 *   X-Frame-Options        no other site can frame these pages to trick a
 *                          click (the admin included). The site's own
 *                          OpenStreetMap iframe is unaffected: this governs
 *                          who may frame *us*, not what we frame.
 *   X-Content-Type-Options a response is only ever read as the type it
 *                          declares — no sniffing a JSON reply into script.
 *   Referrer-Policy        other sites see only the origin of a page that
 *                          linked to them, never its full path or query.
 *   Permissions-Policy     powerful browser features the site never uses are
 *                          switched off, for the page and anything it embeds.
 *   Cross-Origin-Opener-   a page this site opens, or that opens it, gets no
 *     Policy               handle on its window (no reverse tabnabbing, no
 *                          cross-window leaks).
 *   Cross-Origin-Resource- other sites' pages can't load these responses —
 *     Policy               images included, so no hotlinking the paintings.
 *                          Crawlers and the Instagram API fetch server-side,
 *                          which this doesn't govern, and the emails are text.
 *
 * Cross-Origin-Embedder-Policy is deliberately absent: require-corp would
 * block the OpenStreetMap iframe, the map tiles and GA4, none of which send
 * CORP, and it only buys cross-origin isolation, which nothing here needs.
 * The ZAP scan in CI flags it; .zap/rules.tsv records why it is accepted.
 *
 * Content-Security-Policy needs a fresh nonce per request, so it isn't a
 * static header: proxy.ts sets it (lib/csp.ts).
 *
 * HSTS is left to Vercel (two years). Adding includeSubDomains here would
 * commit every subdomain of the domain to HTTPS, a decision for the domain,
 * not this app.
 */
export const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "serial=()",
      "bluetooth=()",
      "browsing-topics=()",
    ].join(", "),
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

/**
 * The Content-Security-Policy for API responses. The page policy comes from
 * proxy.ts with a per-request nonce, and the proxy skips /api on purpose —
 * JSON needs no nonce. But a response with no policy at all is one a browser
 * would run script in if it were ever opened as a document (an error page, a
 * JSON body with HTML in it), and the ZAP scan flags it. Nothing an API
 * returns should load anything or be framed, so: nothing.
 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** Paths ending in an image extension, as a next.config source: the files proxy.ts skips. */
export const IMAGE_FILES = "/(.*\\.(?:jpg|jpeg|png|webp|avif|gif|svg|ico))";

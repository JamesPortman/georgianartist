import { siteConfig } from "@/data/siteConfig";

/**
 * Parsing for /api/csp-report. Browsers send violations in two shapes:
 *
 *   report-uri   application/csp-report      { "csp-report": { "violated-directive", "blocked-uri", "document-uri", … } }
 *   report-to    application/reports+json    [ { type: "csp-violation", body: { effectiveDirective, blockedURL, documentURL, … } } ]
 *
 * Both become a small, bounded record. A blocked URL is cut to its origin and
 * the page to its path — a query string can carry anything, and none of it is
 * needed to see which directive to fix. Reports about pages on other sites
 * are dropped: anyone can POST here, and only this site's pages are ours to fix.
 */

export type Violation = { directive: string; blocked: string; page: string; sample: string | null };

const MAX = { directive: 64, blocked: 200, page: 200, sample: 80 };
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

function origin(value: string): string {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : u.protocol.replace(/:$/, "");
  } catch {
    // Keywords such as "inline", "eval", "data", "blob".
    return value.split(/[\s:]/)[0] || "unknown";
  }
}

function ourPage(documentUrl: string): string | null {
  try {
    const u = new URL(documentUrl);
    const site = new URL(siteConfig.url).hostname.replace(/^www\./, "");
    const host = u.hostname.replace(/^www\./, "");
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return host === site || local ? u.pathname : null;
  } catch {
    return null;
  }
}

function toViolation(fields: {
  directive?: unknown;
  blocked?: unknown;
  document?: unknown;
  sample?: unknown;
}): Violation | null {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const page = ourPage(str(fields.document));
  const directive = str(fields.directive).trim().split(/\s+/)[0];
  if (!page || !directive) return null;
  const sample = str(fields.sample).trim();
  return {
    directive: clip(directive, MAX.directive),
    blocked: clip(origin(str(fields.blocked) || "unknown"), MAX.blocked),
    page: clip(page, MAX.page),
    sample: sample ? clip(sample, MAX.sample) : null,
  };
}

/** Every violation in a report body, whichever shape it arrived in. At most 20. */
export function parseReports(body: unknown): Violation[] {
  const out: Violation[] = [];
  const legacy = (body as { "csp-report"?: Record<string, unknown> } | null)?.["csp-report"];
  if (legacy && typeof legacy === "object") {
    const v = toViolation({
      directive: legacy["effective-directive"] ?? legacy["violated-directive"],
      blocked: legacy["blocked-uri"],
      document: legacy["document-uri"],
      sample: legacy["script-sample"],
    });
    if (v) out.push(v);
  }
  if (Array.isArray(body)) {
    for (const r of body.slice(0, 20)) {
      if (!r || typeof r !== "object" || (r as { type?: unknown }).type !== "csp-violation") continue;
      const b = ((r as { body?: unknown }).body ?? {}) as Record<string, unknown>;
      const v = toViolation({
        directive: b.effectiveDirective,
        blocked: b.blockedURL,
        document: b.documentURL,
        sample: b.sample,
      });
      if (v) out.push(v);
    }
  }
  return out.slice(0, 20);
}

import { describe, it, expect } from "vitest";
import { buildCsp, makeNonce, ENFORCE } from "../lib/csp";
import { parseReports } from "../lib/csp-report";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("buildCsp", () => {
  const pub = buildCsp({ nonce: "abc123" });

  it("allows scripts only by nonce, never inline or by host", () => {
    const scripts = directive(pub, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toMatch(/https?:/);
  });

  it("keeps eval and blob workers to the admin, for the HEIC converter", () => {
    const admin = buildCsp({ nonce: "n", isAdmin: true });
    expect(directive(admin, "script-src")).toContain("'unsafe-eval'");
    expect(directive(admin, "worker-src")).toContain("blob:");
    expect(directive(pub, "worker-src")).not.toContain("blob:");
  });

  it("blocks framing, plugins and base-tag hijacking, and reports violations", () => {
    expect(directive(pub, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(pub, "object-src")).toBe("object-src 'none'");
    expect(directive(pub, "base-uri")).toBe("base-uri 'self'");
    expect(directive(pub, "report-uri")).toBe("report-uri /api/csp-report");
  });

  it("names every outside service the pages use", () => {
    expect(directive(pub, "connect-src")).toContain("https://app.kit.com");
    // A *. wildcard doesn't cover the bare host, and GA4 posts to both.
    expect(directive(pub, "connect-src")).toContain("https://analytics.google.com ");
    expect(directive(pub, "connect-src")).toContain("https://*.g.doubleclick.net");
    // Not google.<country>: Signals is off (app/layout.tsx), so nothing needs it.
    expect(directive(pub, "img-src")).not.toContain("https://*.google.com");
    expect(directive(pub, "img-src")).not.toContain("https://*.google.ca");
    expect(directive(pub, "frame-src")).toContain("https://www.openstreetmap.org");
    expect(directive(pub, "img-src")).toContain("https://tile.openstreetmap.org");
    expect(directive(pub, "media-src")).toContain("https://*.public.blob.vercel-storage.com");
  });

  it("only upgrades insecure requests when asked (enforcing, over HTTPS)", () => {
    expect(pub).not.toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "n", upgradeInsecure: true })).toContain("upgrade-insecure-requests");
  });

  it("is enforcing", () => {
    // Flipped on 28 Sep 2026 after a day of report-only on real traffic
    // showed nothing but the Vercel toolbar and GA's audience ping. Going
    // back to false is a decision, not a fix: CspViolation says what broke.
    expect(ENFORCE).toBe(true);
  });

  it("allows the Vercel toolbar's frame, and nothing else from vercel.live", () => {
    expect(directive(pub, "frame-src")).toContain("https://vercel.live");
    expect(directive(pub, "script-src")).not.toContain("vercel.live");
    expect(directive(pub, "connect-src")).not.toContain("vercel.live");
  });
});

describe("makeNonce", () => {
  it("is fresh every time", () => {
    const seen = new Set(Array.from({ length: 50 }, makeNonce));
    expect(seen.size).toBe(50);
  });
});

describe("parseReports", () => {
  const legacy = (doc: string) => ({
    "csp-report": {
      "document-uri": doc,
      "violated-directive": "script-src-elem",
      "blocked-uri": "https://evil.example/x.js?token=secret",
    },
  });

  it("reads the report-uri shape, keeping only the blocked origin", () => {
    expect(parseReports(legacy("https://www.georgianartist.com/products/lora-bay?utm=x"))).toEqual([
      { directive: "script-src-elem", blocked: "https://evil.example", page: "/products/lora-bay", sample: null },
    ]);
  });

  it("reads the Reporting API shape", () => {
    const body = [
      {
        type: "csp-violation",
        body: { documentURL: "https://georgianartist.com/", effectiveDirective: "img-src", blockedURL: "data" },
      },
      { type: "deprecation", body: {} },
    ];
    expect(parseReports(body)).toEqual([{ directive: "img-src", blocked: "data", page: "/", sample: null }]);
  });

  it("drops reports about other sites' pages", () => {
    expect(parseReports(legacy("https://someone-else.example/"))).toEqual([]);
  });

  it("caps how much one request can record", () => {
    const many = Array.from({ length: 100 }, () => ({
      type: "csp-violation",
      body: { documentURL: "https://www.georgianartist.com/", effectiveDirective: "img-src", blockedURL: "https://x.example/a" },
    }));
    expect(parseReports(many).length).toBeLessThanOrEqual(20);
  });

  it("ignores junk", () => {
    for (const junk of [null, "text", 42, {}, [{}], [{ type: "csp-violation" }]]) {
      expect(parseReports(junk)).toEqual([]);
    }
  });
});

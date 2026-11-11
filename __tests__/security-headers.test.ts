import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { API_CSP, IMAGE_FILES, SECURITY_HEADERS } from "../lib/security-headers";

const header = (key: string) => SECURITY_HEADERS.find((h) => h.key === key)?.value;

describe("security headers", () => {
  it("are applied to every route", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/(.*)");
    expect(all?.headers).toEqual(SECURITY_HEADERS);
  });

  it("give API responses a policy that allows nothing", async () => {
    // The proxy (and its nonce policy) skips /api; without this, API responses
    // had no CSP at all, which the ZAP scan flags once the policy is enforced.
    const rules = await nextConfig.headers!();
    const api = rules.find((r) => r.source === "/api/:path*");
    expect(api?.headers).toEqual([{ key: "Content-Security-Policy", value: API_CSP }]);
    expect(API_CSP).toContain("default-src 'none'");
    expect(API_CSP).toContain("frame-ancestors 'none'");
  });

  it("give image paths, and their 404s, a policy that allows nothing", async () => {
    // proxy.ts skips image files by extension, so a missing one (a 404 page)
    // had no policy; the weekly ZAP scan flagged /paintings/x.jpg.
    const rules = await nextConfig.headers!();
    const images = rules.find((r) => r.source === IMAGE_FILES);
    expect(images?.headers).toEqual([{ key: "Content-Security-Policy", value: API_CSP }]);
    const match = getPathMatch(IMAGE_FILES, { removeUnnamedParams: true, strict: true });
    for (const p of ["/paintings/x.jpg", "/james.jpg", "/a/b.webp", "/icon.svg", "/favicon.ico"]) {
      expect(match(p), p).toBeTruthy();
    }
    // Pages keep the nonce policy from the proxy, not this one.
    for (const p of ["/", "/photographs", "/products/lora-bay", "/paintings"]) {
      expect(match(p), p).toBe(false);
    }
  });

  it("forbid other sites from framing the pages", () => {
    // DENY, not SAMEORIGIN: nothing on the site frames its own pages. The
    // OpenStreetMap iframe is the site framing someone else, which this header
    // doesn't govern.
    expect(header("X-Frame-Options")).toBe("DENY");
  });

  it("stop content sniffing and trim referrers", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("switch off browser features the site never uses", () => {
    const policy = header("Permissions-Policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it("isolate the site's windows and responses from other origins", () => {
    expect(header("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(header("Cross-Origin-Resource-Policy")).toBe("same-origin");
    // Not COEP: require-corp would block the map iframe, the tiles and GA4,
    // and cross-origin isolation buys this site nothing.
    expect(header("Cross-Origin-Embedder-Policy")).toBeUndefined();
  });

  it("don't advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("leave HSTS to Vercel", () => {
    // Vercel already sends two years. includeSubDomains is a domain-wide
    // decision; setting it here would make it silently.
    expect(header("Strict-Transport-Security")).toBeUndefined();
  });
});

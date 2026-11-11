import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";
import { siteConfig } from "../data/siteConfig";

describe("image optimizer sources", () => {
  it("are this site's own Blob store only, named exactly", () => {
    expect(nextConfig.images?.remotePatterns).toEqual([
      { protocol: "https", hostname: new URL(siteConfig.blobStore).hostname },
    ]);
  });

  it("have no wildcard, which would serve any Vercel customer's images on this site's quota", () => {
    for (const p of nextConfig.images?.remotePatterns ?? []) {
      expect(p instanceof URL ? p.hostname : p.hostname).not.toContain("*");
    }
  });
});

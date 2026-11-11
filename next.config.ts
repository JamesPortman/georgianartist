import type { NextConfig } from "next";
import { API_CSP, IMAGE_FILES, SECURITY_HEADERS } from "./lib/security-headers";
import { siteConfig } from "./data/siteConfig";

const nextConfig: NextConfig = {
  // No "X-Powered-By: Next.js": it tells a scanner which exploits to try and
  // tells a visitor nothing (flagged by the ZAP scan in CI).
  poweredByHeader: false,
  // Images are downscaled client-side before upload, but raise the server
  // action limit to Vercel's ~4.5MB serverless body ceiling as a safety net.
  // (Bodies larger than this are rejected by the platform before the action
  // runs, so the inspiration photo is downscaled harder — see imageProcessing.)
  experimental: {
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  // Every route, pages and APIs alike. See lib/security-headers.ts for why each.
  async headers() {
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      // Pages get their policy (with a nonce) from proxy.ts; API responses,
      // which the proxy skips, get the lock-down one.
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
      // Image files skip the proxy too (by extension, proxy.ts), so a missing
      // one, a 404 page, went out with no policy at all (the weekly ZAP scan,
      // Oct 2026). A policy on a real JPEG does nothing; on that 404 it locks
      // the page down.
      { source: IMAGE_FILES, headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
  async redirects() {
    // "Bruce Trail at Craigleith" was renamed to "Bruce Trail at Epping"
    // (8 Sep 2026) after its location was corrected. Keep the old URL working.
    return [
      // FAQ merged into /contact ("FAQ/Contact") on 28 Sep 2026.
      { source: "/faq", destination: "/contact#faq", permanent: true },
      {
        source: "/products/bruce-trail-craigleith",
        destination: "/products/bruce-trail-epping",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        // This site's own Blob store (catalogue and uploaded images), by name.
        // A wildcard over *.public.blob.vercel-storage.com let anyone resize
        // any Vercel customer's images through this site's optimizer and
        // quota (security review, October 2026).
        protocol: "https",
        hostname: new URL(siteConfig.blobStore).hostname,
      },
    ],
  },
};

export default nextConfig;

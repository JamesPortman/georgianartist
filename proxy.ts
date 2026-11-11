import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, ENFORCE, makeNonce } from "@/lib/csp";

/**
 * Sets the Content-Security-Policy on every page, with a fresh nonce each
 * request (see lib/csp.ts for the policy and why it's shaped this way).
 *
 * The policy goes on the *request* too: Next.js reads the nonce from it while
 * rendering and stamps it on its own scripts. It reads either header name, so
 * report-only mode gets nonces exactly as enforcing mode will.
 */
export function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const isHttps = request.nextUrl.protocol === "https:";
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    isAdmin: request.nextUrl.pathname.startsWith("/admin"),
    upgradeInsecure: ENFORCE && isHttps,
  });
  const header = ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(header, csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, Next's static and image files, or image
      // files in public/ — a policy on a JPEG does nothing. By extension, not
      // by folder: this once excluded "photographs", which also matched the
      // /photographs pages, so they shipped with no policy at all until the
      // post-deploy smoke test noticed (scripts/smoke.mjs).
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|webp|avif|gif|svg|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
        // Server actions answer with data, not a page, so they need no policy —
        // and running the proxy on them hung the admin's toggles: the action's
        // POST never got a response (found by e2e/zz-admin-manage.spec.ts).
        { type: "header", key: "next-action" },
      ],
    },
  ],
};

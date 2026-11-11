import { test as base, type Route } from "@playwright/test";

// Every spec imports `test` and `expect` from here, not from @playwright/test
// (__tests__/e2e-imports.test.ts enforces it). The one difference is below.
export * from "@playwright/test";

/**
 * Optimized images (`/_next/image`) are fetched by Playwright and handed to the
 * page, rather than requested by the browser directly, so that a page leaving
 * mid-load can never cancel one on the server.
 *
 * Why: `next start`'s image optimizer hangs for good on a request whose client
 * has already disconnected. It serves the source file through an internal
 * request that borrows the client's socket; with that socket gone the internal
 * request never finishes, and the optimizer's in-flight entry for that image
 * never resolves — so every later request for the same image, from any browser,
 * waits on it forever. Six of those fill Chrome's six connections to the host,
 * after which nothing else the test does reaches the server at all.
 *
 * On a cold image cache (every CI run) that took only a spec logging in and
 * moving on while the admin's 44 thumbnails were still loading. The next spec
 * to open the admin then hung, and it looked like a database stall: a server
 * action "saving…" forever, every later page timing out, Postgres idle. That
 * is what failed zz-admin-manage's visibility test, three CI runs in a row on
 * PR #209 and intermittently for weeks before.
 *
 * A fetch made here outlives the page that asked for it, and teardown waits for
 * every one before the context closes. One the server never answers fails the
 * test by name instead of hanging a later one. Production is unaffected: on
 * Vercel, /_next/image is served by Vercel's optimizer, not by `next start`.
 */
const IMAGE_FETCH_TIMEOUT = 30_000;

export const test = base.extend<{ imageRequestsOutliveThePage: void }>({
  imageRequestsOutliveThePage: [
    async ({ context }, use) => {
      const inFlight = new Set<Promise<void>>();
      const unanswered: string[] = [];

      const handle = async (route: Route) => {
        let response;
        try {
          response = await route.fetch({ timeout: IMAGE_FETCH_TIMEOUT });
        } catch {
          unanswered.push(route.request().url());
          await route.abort().catch(() => {});
          return;
        }
        // The page may have moved on; the server has been answered either way.
        await route.fulfill({ response }).catch(() => {});
      };

      await context.route(
        (url) => url.pathname === "/_next/image",
        (route) => {
          const p = handle(route);
          inFlight.add(p);
          return p.finally(() => inFlight.delete(p));
        }
      );

      await use();

      // Closing the context would cancel these fetches — the very thing this
      // fixture exists to prevent — so let them finish first.
      while (inFlight.size) await Promise.all(inFlight);
      if (unanswered.length) {
        throw new Error(
          `The image optimizer never answered ${unanswered.length} request(s) within ` +
            `${IMAGE_FETCH_TIMEOUT / 1000}s — see "Optimized images" in CLAUDE.md:\n` +
            unanswered.join("\n")
        );
      }
    },
    { auto: true },
  ],
});

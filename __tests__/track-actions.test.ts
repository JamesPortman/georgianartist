import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Which actions /api/track records.
 *
 * Every action the browser can send must be recorded: newsletter_submit and
 * soldout_enquiry were sent by their components for months and silently
 * dropped, because the route kept its own list. And the form outcomes must
 * not be accepted from a browser at all: the routes write those once the
 * email has gone (lib/server-event.ts), and a page that could post them would
 * count a caught bot as a message again.
 */

const written = vi.hoisted(() => [] as (string | null)[]);

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: async () => [{ count: 1 }],
    excludedVisitor: { findUnique: async () => null },
    analyticsEvent: {
      create: async ({ data }: { data: { action: string | null } }) => {
        written.push(data.action);
        return {};
      },
    },
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "visitor-cookie-value" }) }),
  headers: async () =>
    new Headers({
      "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120",
      host: "www.georgianartist.com",
      "x-forwarded-for": "203.0.113.7",
    }),
}));

const { POST } = await import("../app/api/track/route");
const { BROWSER_ACTIONS } = await import("../lib/analytics");

const send = (action: string) =>
  POST(
    new Request("https://www.georgianartist.com/api/track", {
      method: "POST",
      body: JSON.stringify({ kind: "action", action, path: "/" }),
    })
  );

beforeEach(() => {
  written.length = 0;
  vi.stubEnv("VERCEL_ENV", "production");
});

describe("/api/track actions", () => {
  it.each(BROWSER_ACTIONS)("records %s", async (action) => {
    await send(action);
    expect(written).toEqual([action]);
  });

  it.each(["contact_submit", "buy_submit", "spam_blocked", "made_up"])(
    "drops %s from a browser",
    async (action) => {
      expect((await send(action)).status).toBe(204);
      expect(written).toEqual([]);
    }
  );
});

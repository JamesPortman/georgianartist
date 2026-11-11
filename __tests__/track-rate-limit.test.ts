import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/track accepts a bounded number of events per address: a real visitor
 * sends one per page and a few actions; a script must not be able to write
 * unbounded rows. The limiter fails open — an outage must not lose a real
 * visitor's event.
 */

const db = vi.hoisted(() => ({ count: 0, limiterDown: false, writes: 0 }));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: async () => {
      if (db.limiterDown) throw new Error("down");
      db.count++;
      return [{ count: db.count }];
    },
    excludedVisitor: { findUnique: async () => null },
    analyticsEvent: {
      create: async () => {
        db.writes++;
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

const { POST, TRACK_LIMIT } = await import("../app/api/track/route");

const view = () =>
  POST(
    new Request("https://www.georgianartist.com/api/track", {
      method: "POST",
      body: JSON.stringify({ kind: "pageview", path: "/" }),
    })
  );

beforeEach(() => {
  db.count = 0;
  db.limiterDown = false;
  db.writes = 0;
  vi.stubEnv("VERCEL_ENV", "production");
});

describe("/api/track rate limit", () => {
  it("records events up to the limit, then drops them silently", async () => {
    for (let i = 0; i < TRACK_LIMIT.max + 5; i++) expect((await view()).status).toBe(204);
    expect(db.writes).toBe(TRACK_LIMIT.max);
  });

  it("still records the event if the limiter itself is down", async () => {
    db.limiterDown = true;
    await view();
    expect(db.writes).toBe(1);
  });
});

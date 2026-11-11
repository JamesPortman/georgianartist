import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The external monitor treats anything but a 2xx as down, so the endpoint's
 * whole job is the status code: 200 with the database up, 503 without it —
 * and it never says more than that.
 */

const db = vi.hoisted(() => ({ count: 25 as number | Error }));

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      count: async () => {
        if (db.count instanceof Error) throw db.count;
        return db.count;
      },
    },
  },
}));

const { GET } = await import("../app/api/health/route");

beforeEach(() => {
  db.count = 25;
});

describe("/api/health", () => {
  it("answers 200 when the catalogue can be read, cached briefly at the edge", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toContain("s-maxage=1800");
  });

  it("answers 503 when the database is down, and never caches it", async () => {
    db.count = new Error("connect ECONNREFUSED 10.0.0.5:5432");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 for an empty catalogue too; a site with no works is down to a visitor", async () => {
    db.count = 0;
    expect((await GET()).status).toBe(503);
  });

  it("leaks nothing: no counts, no error text", async () => {
    db.count = new Error("password authentication failed for user neondb_owner");
    const body = await (await GET()).text();
    expect(body).toBe('{"ok":false}');
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The admin login limiter lives in Postgres, so it holds across serverless
 * instances; it counts failures, not attempts; and it fails open, because the
 * admin locked out of a broken site is the one who has to fix it.
 */

const db = vi.hoisted(() => ({
  row: null as { count: number; ageSec: number } | null,
  fail: false,
  upserts: 0,
  deletes: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray) => {
      if (db.fail) throw new Error("down");
      if (strings[0]!.includes("INSERT")) {
        db.upserts++;
        return [];
      }
      return db.row ? [db.row] : [];
    },
    formRateLimit: {
      deleteMany: async ({ where }: { where: { key: string } }) => {
        db.deletes.push(where.key);
        return { count: 1 };
      },
    },
  },
}));

const { isRateLimited, recordFailure, clearFailures, loginKey, LOGIN_LIMIT } = await import("../lib/rate-limit");

beforeEach(() => {
  db.row = null;
  db.fail = false;
  db.upserts = 0;
  db.deletes.length = 0;
});

describe("login limiter", () => {
  it("keys on an HMAC of the address, never the address", () => {
    expect(loginKey("203.0.113.7")).not.toContain("203.0.113.7");
    expect(loginKey("203.0.113.7")).toBe(loginKey("203.0.113.7"));
  });

  it("allows an address with no failures, or fewer than the limit", async () => {
    expect((await isRateLimited("k")).blocked).toBe(false);
    db.row = { count: LOGIN_LIMIT.max - 1, ageSec: 10 };
    expect((await isRateLimited("k")).blocked).toBe(false);
  });

  it("locks out at the limit, and says how long is left", async () => {
    db.row = { count: LOGIN_LIMIT.max, ageSec: 60 };
    expect(await isRateLimited("k")).toEqual({ blocked: true, retryAfterSec: LOGIN_LIMIT.windowSec - 60 });
  });

  it("forgets a window that has expired", async () => {
    db.row = { count: 99, ageSec: LOGIN_LIMIT.windowSec + 1 };
    expect((await isRateLimited("k")).blocked).toBe(false);
  });

  it("records failures in the database and clears them on success", async () => {
    await recordFailure("k");
    expect(db.upserts).toBe(1);
    await clearFailures("k");
    expect(db.deletes).toEqual(["k"]);
  });

  it("fails open when the database is down", async () => {
    db.fail = true;
    expect((await isRateLimited("k")).blocked).toBe(false);
    await expect(recordFailure("k")).resolves.toBeUndefined();
  });
});

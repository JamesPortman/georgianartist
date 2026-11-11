import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }));
const hostHeader = vi.hoisted(() => ({ value: "www.georgianartist.com" }));
// The Vercel build sets VERCEL_ENV=preview while running these, which would
// make the route drop every event. Pin it so the tests describe the route,
// not the machine.
const originalVercelEnv = process.env.VERCEL_ENV;

vi.mock("@/lib/db", () => ({
  prisma: {
    excludedVisitor: { findUnique },
    analyticsEvent: { create },
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieStore.value ? { value: cookieStore.value } : undefined) }),
  headers: async () =>
    new Headers({ "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120", host: hostHeader.value }),
}));

const { POST } = await import("../app/api/track/route");
const { isNonProductionRequest } = await import("../lib/analytics");

const post = (body: unknown) =>
  POST(new Request("https://www.georgianartist.com/api/track", {
    method: "POST",
    body: JSON.stringify(body),
  }));

const VISITOR = "3e2a602d-0000-4000-8000-000000000000";

beforeEach(() => {
  findUnique.mockReset();
  create.mockReset();
  create.mockResolvedValue({});
  cookieStore.value = VISITOR;
  hostHeader.value = "www.georgianartist.com";
  process.env.VERCEL_ENV = "production";
});

afterAll(() => {
  if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = originalVercelEnv;
});

/**
 * The artist's own browsing was the single largest "city" in the dashboard —
 * 449 events, more than any real audience. Excluded browsers are dropped here
 * rather than filtered in the dashboard's dozen-odd queries, several of them
 * raw SQL, because a filter every query has to remember is a trap: the next
 * query added silently counts the owner again.
 *
 * The bias that matters: never lose a real visitor's event. An exclusion
 * lookup that fails must count, not drop.
 */
describe("analytics ingest exclusion", () => {
  it("records an event from a browser that isn't excluded", async () => {
    findUnique.mockResolvedValue(null);
    const res = await post({ kind: "pageview", path: "/products/scenic-caves" });
    expect(res.status).toBe(204);
    expect(create).toHaveBeenCalledOnce();
  });

  it("drops an event from an excluded browser", async () => {
    findUnique.mockResolvedValue({ visitorId: VISITOR });
    await post({ kind: "pageview", path: "/products/scenic-caves" });
    expect(create).not.toHaveBeenCalled();
  });

  it("looks the visitor up by cookie, never by city", async () => {
    findUnique.mockResolvedValue(null);
    await post({ kind: "pageview", path: "/" });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { visitorId: VISITOR } })
    );
  });

  it("still records when the exclusion lookup fails; a real visit must not be lost", async () => {
    findUnique.mockRejectedValue(new Error("database unreachable"));
    const res = await post({ kind: "pageview", path: "/" });
    expect(res.status).toBe(204);
    expect(create).toHaveBeenCalledOnce();
  });

  it("drops excluded action events too, not just pageviews", async () => {
    findUnique.mockResolvedValue({ visitorId: VISITOR });
    await post({ kind: "action", action: "product_click", path: "/", productId: "scenic-caves" });
    expect(create).not.toHaveBeenCalled();
  });

  it("never reaches the lookup for admin paths", async () => {
    await post({ kind: "pageview", path: "/admin/analytics" });
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 204 either way, so the page can't tell it was excluded", async () => {
    findUnique.mockResolvedValue({ visitorId: VISITOR });
    expect((await post({ kind: "pageview", path: "/" })).status).toBe(204);
    findUnique.mockResolvedValue(null);
    expect((await post({ kind: "pageview", path: "/" })).status).toBe(204);
  });
});

/**
 * A Playwright suite run locally against `.env` — which points at the
 * production database — has already written 131 events into it: 110 on one
 * day, a fresh visitor id per test, and E2E fixture paths
 * (/photographs/clarksburg-library, /products/singhampton-winter). They are
 * distinguishable only by having no country and no city at all, because there
 * is no Vercel edge in front of localhost.
 *
 * The check is a DENY-list on purpose. An allow-list of production hostnames
 * fails closed — rename the domain and real traffic silently stops being
 * counted, with nothing visibly broken. Failing open costs, at worst, some
 * test traffic being counted.
 */
describe("isNonProductionRequest", () => {
  it.each([
    ["localhost:3000", true],
    ["localhost", true],
    ["127.0.0.1:3000", true],
    ["[::1]:3000", true],
    ["app.localhost:3000", true],
    ["mymac.local", true],
    ["georgianartist.test", true],
  ])("drops %s", (host, expected) => {
    expect(isNonProductionRequest(host, "production")).toBe(expected);
  });

  it.each([
    ["www.georgianartist.com", false],
    ["georgianartist.com", false],
  ])("counts %s", (host, expected) => {
    expect(isNonProductionRequest(host, "production")).toBe(expected);
  });

  it("drops Vercel preview deployments whatever the hostname", () => {
    expect(isNonProductionRequest("gba-abc123.vercel.app", "preview")).toBe(true);
  });

  it("counts an unrecognised host rather than losing a real visitor", () => {
    // Fails open: a renamed domain must not silently stop analytics.
    expect(isNonProductionRequest("georgianbayartists.ca", undefined)).toBe(false);
    expect(isNonProductionRequest("georgianbayartists.ca", "production")).toBe(false);
  });

  it("counts a request with no Host header at all", () => {
    expect(isNonProductionRequest(null, "production")).toBe(false);
    expect(isNonProductionRequest("", "production")).toBe(false);
  });
});

describe("analytics ingest host gate", () => {
  it("records a production request", async () => {
    findUnique.mockResolvedValue(null);
    hostHeader.value = "www.georgianartist.com";
    await post({ kind: "pageview", path: "/" });
    expect(create).toHaveBeenCalledOnce();
  });

  it("drops a localhost request before it reaches the database", async () => {
    findUnique.mockResolvedValue(null);
    hostHeader.value = "localhost:3000";
    await post({ kind: "pageview", path: "/photographs/clarksburg-library" });
    expect(create).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
});

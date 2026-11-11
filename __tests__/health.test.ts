import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transition, checkPage, checkDatabase } from "../lib/health";
import { siteConfig } from "../data/siteConfig";

/**
 * The health check's job is to email once when the site breaks and once when
 * it recovers — never silently, and never every ten minutes.
 */

describe("transition", () => {
  it.each([
    [null, false, null, "first run, healthy: nothing to say"],
    [null, true, "failed", "first run, broken: say so"],
    [false, true, "failed", "healthy → broken"],
    [true, true, null, "still broken: already said"],
    [true, false, "recovered", "broken → healthy"],
    [false, false, null, "still healthy"],
    ["unknown", true, "failed", "state unreadable and broken: report rather than risk silence"],
    ["unknown", false, null, "state unreadable but healthy"],
  ] as const)("%s → %s gives %s (%s)", (was, now, expected, _why) => {
    expect(transition(was, now)).toBe(expected);
  });
});

const page = (status: number, body: string) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe("checkPage", () => {
  it("passes a 200 that rendered the storefront", async () => {
    const c = await checkPage("https://example.test", "/", page(200, `<nav>${siteConfig.brand}</nav>`));
    expect(c.ok).toBe(true);
  });

  it("fails an error status", async () => {
    const c = await checkPage("https://example.test", "/", page(500, "oops"));
    expect(c).toMatchObject({ ok: false, detail: "HTTP 500" });
  });

  it("fails a 200 that didn't render the storefront", async () => {
    // A blank or error shell served with 200 is still an outage to a visitor.
    const c = await checkPage("https://example.test", "/", page(200, "<html></html>"));
    expect(c.ok).toBe(false);
  });

  it("fails when the request itself fails", async () => {
    const boom = (async () => { throw new Error("timed out"); }) as unknown as typeof fetch;
    const c = await checkPage("https://example.test", "/", boom);
    expect(c).toMatchObject({ ok: false, detail: "timed out" });
  });
});

describe("checkDatabase", () => {
  it("fails an empty catalogue, not only an unreachable one", async () => {
    expect((await checkDatabase(async () => 0)).ok).toBe(false);
    expect((await checkDatabase(async () => { throw new Error("connection refused"); })).ok).toBe(false);
    expect((await checkDatabase(async () => 25)).ok).toBe(true);
  });
});

// ── The route, end to end with its dependencies faked ─────────────────────────

const state = vi.hoisted(() => ({
  was: null as boolean | null,
  dbDown: false,
  pageStatus: 200,
  alerts: [] as { subject: string; prefix?: string }[],
}));

vi.mock("@/lib/notify", () => ({
  sendAlert: async (subject: string, _text: string, prefix?: string) => {
    state.alerts.push({ subject, prefix });
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findFirst: async () => (state.dbDown ? Promise.reject(new Error("down")) : { id: "lora-bay" }),
      count: async () => (state.dbDown ? Promise.reject(new Error("down")) : 25),
    },
    $queryRaw: async (_s: TemplateStringsArray, failing: boolean) => {
      if (state.dbDown) throw new Error("down");
      const was = state.was;
      state.was = failing;
      return [{ wasFailing: was, wasSince: new Date(Date.now() - 20 * 60_000) }];
    },
  },
}));

const { GET } = await import("../app/api/cron/health/route");

// Vercel's build runs these tests with the production CRON_SECRET set, CI
// without one. The first version relied on it being unset, so it passed in CI
// and failed the production build with 401s. Pin it here instead.
const SECRET = "test-cron-secret";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  state.was = null;
  state.dbDown = false;
  state.pageStatus = 200;
  state.alerts.length = 0;
  vi.stubGlobal(
    "fetch",
    async () => new Response(`<nav>${siteConfig.brand}</nav>`, { status: state.pageStatus })
  );
});

const run = () =>
  GET(new Request("http://localhost/api/cron/health", { headers: { authorization: `Bearer ${SECRET}` } }));

describe("/api/cron/health", () => {
  it("refuses a request without the cron secret, and checks nothing", async () => {
    const res = await GET(new Request("http://localhost/api/cron/health"));
    expect(res.status).toBe(401);
    expect(state.alerts).toHaveLength(0);
  });

  it("is quiet while everything passes", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(state.alerts).toHaveLength(0);
  });

  it("emails once when a page breaks, not on every run after", async () => {
    await run();
    state.pageStatus = 500;
    expect((await run()).status).toBe(503);
    await run();
    await run();
    expect(state.alerts.map((a) => a.subject)).toEqual([expect.stringMatching(/failing/)]);
  });

  it("emails once more on recovery, marked as good news", async () => {
    state.pageStatus = 500;
    await run();
    state.pageStatus = 200;
    await run();
    expect(state.alerts).toHaveLength(2);
    expect(state.alerts[1]).toMatchObject({ subject: expect.stringMatching(/recovered/), prefix: "✅" });
  });

  it("still emails when the database is down and state can't be recorded", async () => {
    state.dbDown = true;
    const res = await run();
    expect(res.status).toBe(503);
    expect(state.alerts.map((a) => a.subject)).toEqual([expect.stringMatching(/failing/)]);
  });
});

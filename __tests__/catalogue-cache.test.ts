import { describe, it, expect } from "vitest";
import { reviveDates, cacheKey } from "../lib/catalogue-cache";

/**
 * The catalogue cache stores results as JSON, which turns Dates into strings.
 * The sitemap's lastModified and anything else reading an …At field expects a
 * Date, so they are revived on the way out, and nothing else is touched.
 */
describe("reviveDates", () => {
  it("revives ISO strings under keys ending in At, at any depth", () => {
    const out = reviveDates([{ id: "a", updatedAt: "2026-09-01T12:00:00.000Z", film: { createdAt: "2026-01-02T03:04:05Z" } }]);
    expect(out[0]!.updatedAt).toBeInstanceOf(Date);
    expect((out[0]!.updatedAt as unknown as Date).toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(out[0]!.film.createdAt).toBeInstanceOf(Date);
  });

  it("leaves other strings alone, even ones that look like dates", () => {
    const out = reviveDates({ title: "2026-09-01T12:00:00.000Z", lastAt: "not a date", count: 3, gone: null });
    expect(out).toEqual({ title: "2026-09-01T12:00:00.000Z", lastAt: "not a date", count: 3, gone: null });
  });
});

describe("cacheKey", () => {
  // Next's data cache outlives a deploy; a key without the deployment served a
  // new build the previous one's reads, including image paths it had deleted.
  it("differs between deployments, so each starts with an empty cache", () => {
    expect(cacheKey("product.findMany", "dpl_a")).not.toEqual(cacheKey("product.findMany", "dpl_b"));
  });

  it("is stable within a deployment and separate per query", () => {
    expect(cacheKey("product.findMany", "dpl_a")).toEqual(cacheKey("product.findMany", "dpl_a"));
    expect(cacheKey("product.findMany", "dpl_a")).not.toEqual(cacheKey("product.findFirst", "dpl_a"));
  });

  it("uses Vercel's deployment id, then the commit, and works with neither", () => {
    const saved = { d: process.env.VERCEL_DEPLOYMENT_ID, c: process.env.VERCEL_GIT_COMMIT_SHA };
    try {
      process.env.VERCEL_DEPLOYMENT_ID = "dpl_x";
      process.env.VERCEL_GIT_COMMIT_SHA = "abc";
      expect(cacheKey("q")).toEqual(["catalogue", "q", "dpl_x"]);
      delete process.env.VERCEL_DEPLOYMENT_ID;
      expect(cacheKey("q")).toEqual(["catalogue", "q", "abc"]);
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      expect(cacheKey("q")).toEqual(["catalogue", "q", ""]);
    } finally {
      if (saved.d === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
      else process.env.VERCEL_DEPLOYMENT_ID = saved.d;
      if (saved.c === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = saved.c;
    }
  });
});

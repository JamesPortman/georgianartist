import { describe, it, expect, afterEach, vi } from "vitest";
import { GET } from "../app/api/version/route";

afterEach(() => vi.unstubAllEnvs());

describe("/api/version", () => {
  it("reports the deployed commit, uncached", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abc123");
    const res = GET();
    expect(await res.json()).toEqual({ commit: "abc123" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("reports null outside Vercel", async () => {
    // Vercel's build runs these tests with its own env, so pin it either way.
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    expect(await GET().json()).toEqual({ commit: null });
  });
});

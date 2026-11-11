import { describe, it, expect, vi, afterEach } from "vitest";
import { sealData, unsealData } from "iron-session";

/**
 * The server-side lifetime of the admin cookie, with the real iron-session
 * (session.test.ts mocks it). A copied cookie must stop working when the
 * session ends, not after iron-session's default 14 days.
 */

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("admin session expiry", () => {
  it("is accepted within eight hours and refused after", async () => {
    vi.stubEnv("SESSION_SECRET", "s".repeat(32));
    const { sessionOptions, SESSION_TTL_SEC } = await import("../lib/session");
    expect(SESSION_TTL_SEC).toBe(8 * 60 * 60);
    const password = "s".repeat(32);
    const ttl = sessionOptions.ttl;
    const start = Date.now();
    const seal = await sealData({ isLoggedIn: true }, { password, ttl });

    vi.useFakeTimers({ now: start + 7 * 60 * 60 * 1000 });
    expect(await unsealData(seal, { password, ttl })).toEqual({ isLoggedIn: true });

    vi.setSystemTime(start + 9 * 60 * 60 * 1000);
    expect(await unsealData(seal, { password, ttl })).toEqual({});
  });
});

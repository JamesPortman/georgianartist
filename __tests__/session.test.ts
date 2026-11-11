import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The admin session cookie (lib/session.ts). Every other test fakes the
 * session, so until these, mutation testing found nothing noticed if the
 * cookie became readable by scripts, was sent cross-site, lasted forever,
 * went out over plain http in production, or was sealed with the wrong key.
 */

const sealed = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("iron-session", () => ({
  getIronSession: async (...args: unknown[]) => {
    sealed.calls.push(args);
    return { isLoggedIn: false };
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => "the-cookie-store" }));

/** lib/session.ts as loaded under a given NODE_ENV and SESSION_SECRET. */
async function load(nodeEnv: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  return import("../lib/session");
}

afterEach(() => {
  vi.unstubAllEnvs();
  sealed.calls = [];
});

describe("sessionOptions", () => {
  it("is an http-only, same-site cookie that lasts one working day, sealed with SESSION_SECRET", async () => {
    const { sessionOptions } = await load("production");
    expect(sessionOptions).toEqual({
      cookieName: "admin_session",
      password: "s".repeat(32),
      ttl: 8 * 60 * 60,
      cookieOptions: { secure: true, httpOnly: true, sameSite: "lax" },
    });
  });


  it("is sent over plain http only outside production (local runs, CI)", async () => {
    expect((await load("test")).sessionOptions.cookieOptions?.secure).toBe(false);
    expect((await load("development")).sessionOptions.cookieOptions?.secure).toBe(false);
  });
});

describe("getAdminSession", () => {
  it("opens the session from this request's cookies with those options", async () => {
    const { getAdminSession, sessionOptions } = await load("test");
    expect(await getAdminSession()).toEqual({ isLoggedIn: false });
    expect(sealed.calls).toEqual([["the-cookie-store", sessionOptions]]);
  });
});

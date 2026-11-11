import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  relyingParty,
  passwordLoginAllowed,
  challengeIsFresh,
  PASSKEY_CHALLENGE_TTL_MS,
  ADMIN_USER_ID,
} from "../lib/passkey";

/**
 * Passkeys replace the admin password: once one is registered the password
 * stops working, except under the ADMIN_PASSWORD_LOGIN break-glass. And a
 * ceremony is only ever bound to this site's own domain.
 */

describe("relyingParty", () => {
  const site = "https://www.georgianartist.com";

  it("uses the registrable domain, so a passkey made on www. works on the bare domain too", () => {
    expect(relyingParty("www.georgianartist.com", site)).toEqual({
      rpID: "georgianartist.com",
      origin: "https://www.georgianartist.com",
    });
    expect(relyingParty("georgianartist.com", site)?.rpID).toBe("georgianartist.com");
  });

  it("works on localhost, with its port, for local runs and CI", () => {
    expect(relyingParty("localhost:3000", site)).toEqual({ rpID: "localhost", origin: "http://localhost:3000" });
  });

  it("matches the host whatever its case or surrounding space, keeping the port in the origin", () => {
    expect(relyingParty("  WWW.GeorgianArtist.com:443 ", site)).toEqual({
      rpID: "georgianartist.com",
      origin: "https://www.georgianartist.com:443",
    });
  });

  it("refuses any other host rather than binding a passkey to it", () => {
    expect(relyingParty("evil.example", site)).toBeNull();
    expect(relyingParty("georgianartist.com.evil.example", site)).toBeNull();
    expect(relyingParty("notgeorgianartist.com", site)).toBeNull();
    expect(relyingParty("127.0.0.1:3000", site)).toBeNull();
    expect(relyingParty(null, site)).toBeNull();
  });

  it("refuses other subdomains, which a dangling DNS record could hand to someone else", () => {
    expect(relyingParty("shop.georgianartist.com", site)).toBeNull();
    expect(relyingParty("www.www.georgianartist.com", site)).toBeNull();
  });
});

describe("ADMIN_USER_ID", () => {
  it("never changes: every registered passkey is stored against it", () => {
    expect(new TextDecoder().decode(ADMIN_USER_ID)).toBe("georgianartist-admin");
  });
});

describe("passwordLoginAllowed", () => {
  it("allows the password only until a passkey exists", () => {
    expect(passwordLoginAllowed(0, {})).toBe(true);
    expect(passwordLoginAllowed(1, {})).toBe(false);
  });

  it("lets the break-glass switch it back on, and only the exact value does", () => {
    expect(passwordLoginAllowed(2, { ADMIN_PASSWORD_LOGIN: "1" })).toBe(true);
    expect(passwordLoginAllowed(2, { ADMIN_PASSWORD_LOGIN: "true" })).toBe(false);
  });
});

describe("challengeIsFresh", () => {
  it("accepts a challenge inside its five minutes, and nothing else", () => {
    const now = 1_000_000_000;
    expect(challengeIsFresh(now - 1000, now)).toBe(true);
    expect(challengeIsFresh(now - PASSKEY_CHALLENGE_TTL_MS, now)).toBe(false);
    expect(challengeIsFresh(now + 1000, now)).toBe(false);
    expect(challengeIsFresh(undefined, now)).toBe(false);
  });
});

// ── The password login, with passkeys registered ─────────────────────────────

const state = vi.hoisted(() => ({ passkeys: 0, dbDown: false, loggedIn: false }));

vi.mock("@/lib/db", () => ({
  prisma: {
    adminPasskey: {
      count: async () => {
        if (state.dbDown) throw new Error("down");
        return state.passkeys;
      },
    },
    $queryRaw: async () => [],
    formRateLimit: { deleteMany: async () => ({ count: 0 }) },
  },
}));
vi.mock("@/lib/session", () => ({
  getAdminSession: async () => ({
    set isLoggedIn(v: boolean) {
      state.loggedIn = v;
    },
    save: async () => {},
  }),
}));
vi.mock("@/lib/client-ip", () => ({ clientIp: async () => "203.0.113.7" }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("@vercel/blob", () => ({ put: async () => ({ url: "" }) }));

const { loginAction } = await import("../app/actions/admin");
const form = (password: string) => {
  const f = new FormData();
  f.set("password", password);
  return f;
};

beforeEach(() => {
  state.passkeys = 0;
  state.dbDown = false;
  state.loggedIn = false;
  vi.stubEnv("ADMIN_PASSWORD", "correct horse");
  vi.stubEnv("ADMIN_PASSWORD_LOGIN", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("loginAction", () => {
  it("signs in with the password while no passkey exists", async () => {
    await expect(loginAction(form("correct horse"))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.loggedIn).toBe(true);
  });

  it("refuses even the right password once a passkey exists", async () => {
    state.passkeys = 1;
    expect(await loginAction(form("correct horse"))).toEqual({ error: "This admin signs in with a passkey." });
    expect(state.loggedIn).toBe(false);
  });

  it("gives the same answer for a wrong password, so it reveals nothing", async () => {
    state.passkeys = 1;
    expect(await loginAction(form("wrong"))).toEqual({ error: "This admin signs in with a passkey." });
  });

  it("accepts the password again under the break-glass", async () => {
    state.passkeys = 1;
    vi.stubEnv("ADMIN_PASSWORD_LOGIN", "1");
    await expect(loginAction(form("correct horse"))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.loggedIn).toBe(true);
  });

  it("fails closed when it can't tell whether a passkey exists", async () => {
    state.dbDown = true;
    expect((await loginAction(form("correct horse")))?.error).toMatch(/database/i);
    expect(state.loggedIn).toBe(false);
  });
});

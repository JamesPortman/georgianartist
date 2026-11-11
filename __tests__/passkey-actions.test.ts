import { describe, it, expect, vi, beforeEach } from "vitest";
import { siteConfig } from "../data/siteConfig";

/**
 * The passkey ceremonies (app/actions/passkey.ts): what has to be true before
 * the admin is signed in, or a new passkey is stored.
 *
 * e2e/zz-admin-passkey.spec.ts proves a real authenticator round-trips. These
 * pin the refusals, which an end-to-end happy path can't: mutation testing
 * found that deleting the challenge check, the single-use reset, the failure
 * count or the verification itself passed every unit test, because there were
 * none for this file. The WebAuthn library is faked; what is tested is what
 * this code asks of it and does with its answer.
 */

type Session = {
  isLoggedIn?: boolean;
  passkeyChallenge?: string;
  passkeyChallengeAt?: number;
  saves: number;
};

const state = vi.hoisted(() => ({
  host: "www.georgianartist.com" as string | null,
  forwardedHost: null as string | null,
  session: { saves: 0 } as Session,
  signedIn: true,
  blocked: false,
  retryAfterSec: 0,
  failures: [] as string[],
  cleared: [] as string[],
  stored: [] as { id: string; publicKey: string; counter: number; transports: string | null }[],
  updates: [] as unknown[],
  creates: [] as Record<string, unknown>[],
  deletes: [] as unknown[],
  revalidated: [] as string[],
  verifyAuth: null as null | (() => { verified: boolean; authenticationInfo: { newCounter: number } }),
  verifyReg: null as null | (() => unknown),
  authArgs: [] as Record<string, unknown>[],
  regArgs: [] as Record<string, unknown>[],
  optionArgs: [] as Record<string, unknown>[],
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name === "x-forwarded-host" ? state.forwardedHost : name === "host" ? state.host : null),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => state.revalidated.push(p) }));
vi.mock("@/lib/client-ip", () => ({ clientIp: async () => "203.0.113.7" }));
vi.mock("@/lib/session", () => ({
  getAdminSession: async () =>
    Object.assign(state.session, {
      save: async () => {
        state.session.saves++;
      },
    }),
}));
vi.mock("@/lib/rate-limit", () => ({
  loginKey: (ip: string) => `login:${ip}`,
  isRateLimited: async () => ({ blocked: state.blocked, retryAfterSec: state.retryAfterSec }),
  recordFailure: async (key: string) => void state.failures.push(key),
  clearFailures: async (key: string) => void state.cleared.push(key),
}));
vi.mock("@/app/actions/admin", () => ({
  requireAuth: async () => {
    if (!state.signedIn) throw new Error("NEXT_REDIRECT /admin/login");
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    adminPasskey: {
      findUnique: async ({ where }: { where: { id: string } }) => state.stored.find((p) => p.id === where.id) ?? null,
      findMany: async () => state.stored.map(({ id, transports }) => ({ id, transports })),
      update: async (args: unknown) => void state.updates.push(args),
      create: async (args: { data: Record<string, unknown> }) => void state.creates.push(args.data),
      delete: async (args: unknown) => {
        state.deletes.push(args);
        throw new Error("already gone");
      },
    },
  },
}));
vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: async (args: Record<string, unknown>) => {
    state.optionArgs.push(args);
    return { challenge: "login-challenge" };
  },
  generateRegistrationOptions: async (args: Record<string, unknown>) => {
    state.optionArgs.push(args);
    return { challenge: "register-challenge" };
  },
  verifyAuthenticationResponse: async (args: Record<string, unknown>) => {
    state.authArgs.push(args);
    return state.verifyAuth!();
  },
  verifyRegistrationResponse: async (args: Record<string, unknown>) => {
    state.regArgs.push(args);
    return state.verifyReg!();
  },
}));

const actions = await import("../app/actions/passkey");
const answer = (id = "cred-1") => ({ id }) as Parameters<typeof actions.passkeyLoginVerifyAction>[0];
const regAnswer = {} as Parameters<typeof actions.passkeyRegisterVerifyAction>[0];
const KEY = "login:203.0.113.7";

beforeEach(() => {
  vi.useRealTimers();
  state.host = "www.georgianartist.com";
  state.forwardedHost = null;
  state.session = { saves: 0, passkeyChallenge: "login-challenge", passkeyChallengeAt: Date.now() - 1000 };
  state.signedIn = true;
  state.blocked = false;
  state.retryAfterSec = 0;
  state.failures = [];
  state.cleared = [];
  state.stored = [{ id: "cred-1", publicKey: "AQID", counter: 4, transports: "internal,hybrid" }];
  state.updates = [];
  state.creates = [];
  state.deletes = [];
  state.revalidated = [];
  state.verifyAuth = () => ({ verified: true, authenticationInfo: { newCounter: 5 } });
  state.verifyReg = () => ({
    verified: true,
    registrationInfo: {
      credential: { id: "cred-new", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] },
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
    },
  });
  state.authArgs = [];
  state.regArgs = [];
  state.optionArgs = [];
});

describe("sign-in options", () => {
  it("issues a challenge for this site, requiring the person, and keeps it in the session", async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    state.session = { saves: 0 };
    expect(await actions.passkeyLoginOptionsAction()).toEqual({ options: { challenge: "login-challenge" } });
    expect(state.optionArgs).toEqual([{ rpID: "georgianartist.com", userVerification: "required" }]);
    expect(state.session).toMatchObject({ passkeyChallenge: "login-challenge", passkeyChallengeAt: 1_700_000_000_000 });
    expect(state.session.saves).toBe(1);
  });

  it("prefers the forwarded host, which is the address the browser used", async () => {
    state.host = "internal.vercel.app";
    state.forwardedHost = "georgianartist.com";
    expect(await actions.passkeyLoginOptionsAction()).toHaveProperty("options");
  });

  it("refuses an address that isn't this site, without issuing anything", async () => {
    state.host = "evil.example";
    expect(await actions.passkeyLoginOptionsAction()).toEqual({ error: "Passkeys can't be used on this address." });
    expect(state.optionArgs).toEqual([]);
  });

  it.each([
    [30, "about 1 minute."],
    [61, "about 2 minutes."],
    [0, "about 1 minute."],
  ])("refuses while locked out (%ss left), saying for how long", async (secs, wait) => {
    state.blocked = true;
    state.retryAfterSec = secs;
    expect(await actions.passkeyLoginOptionsAction()).toEqual({
      error: `Too many attempts. Please try again in ${wait}`,
    });
    expect(state.optionArgs).toEqual([]);
  });
});

describe("sign-in", () => {
  it("signs in on a verified answer to this session's challenge, and records the new counter", async () => {
    expect(await actions.passkeyLoginVerifyAction(answer())).toEqual({ ok: true });
    expect(state.session.isLoggedIn).toBe(true);
    expect(state.authArgs[0]).toMatchObject({
      expectedChallenge: "login-challenge",
      expectedOrigin: "https://www.georgianartist.com",
      expectedRPID: "georgianartist.com",
      requireUserVerification: true,
      credential: { id: "cred-1", counter: 4, transports: ["internal", "hybrid"] },
    });
    expect(Array.from((state.authArgs[0]!.credential as { publicKey: Uint8Array }).publicKey)).toEqual([1, 2, 3]);
    expect(state.updates).toEqual([
      { where: { id: "cred-1" }, data: { counter: 5, lastUsedAt: expect.any(Date) } },
    ]);
    expect(state.cleared).toEqual([KEY]);
    expect(state.failures).toEqual([]);
  });

  it("passes no transports for a passkey stored without them", async () => {
    state.stored[0]!.transports = null;
    await actions.passkeyLoginVerifyAction(answer());
    expect((state.authArgs[0]!.credential as { transports?: string[] }).transports).toBeUndefined();
  });

  it("uses the challenge once: it is cleared before anything else is checked", async () => {
    state.verifyAuth = () => ({ verified: false, authenticationInfo: { newCounter: 0 } });
    await actions.passkeyLoginVerifyAction(answer());
    expect(state.session.passkeyChallenge).toBeUndefined();
    expect(state.session.passkeyChallengeAt).toBeUndefined();
    expect(state.session.saves).toBeGreaterThan(0);
    // The same answer again finds no challenge.
    state.verifyAuth = () => ({ verified: true, authenticationInfo: { newCounter: 9 } });
    expect(await actions.passkeyLoginVerifyAction(answer())).toEqual({ error: "That took too long. Please try again." });
    expect(state.session.isLoggedIn).toBeUndefined();
  });

  it.each([
    ["no challenge was issued", { passkeyChallenge: undefined, passkeyChallengeAt: Date.now() }],
    ["the challenge is stale", { passkeyChallenge: "login-challenge", passkeyChallengeAt: Date.now() - 6 * 60_000 }],
  ])("refuses when %s, without asking the library", async (_, s) => {
    state.session = { saves: 0, ...s };
    expect(await actions.passkeyLoginVerifyAction(answer())).toEqual({ error: "That took too long. Please try again." });
    expect(state.authArgs).toEqual([]);
    expect(state.session.isLoggedIn).toBeUndefined();
  });

  it("refuses, and counts a failure, for a passkey this admin never registered", async () => {
    expect(await actions.passkeyLoginVerifyAction(answer("someone-else"))).toEqual({
      error: "That passkey isn't registered for this admin.",
    });
    expect(state.failures).toEqual([KEY]);
    expect(state.authArgs).toEqual([]);
    expect(state.session.isLoggedIn).toBeUndefined();
  });

  it.each([
    ["the signature doesn't verify", () => ({ verified: false, authenticationInfo: { newCounter: 5 } })],
    [
      "the library throws",
      () => {
        throw new Error("bad signature");
      },
    ],
  ])("refuses, and counts a failure, when %s", async (_, verify) => {
    state.verifyAuth = verify;
    expect(await actions.passkeyLoginVerifyAction(answer())).toEqual({ error: "The passkey couldn't be verified." });
    expect(state.failures).toEqual([KEY]);
    expect(state.updates).toEqual([]);
    expect(state.cleared).toEqual([]);
    expect(state.session.isLoggedIn).toBeUndefined();
  });

  it("treats a malformed answer, with no id, as an unregistered passkey rather than crashing", async () => {
    const malformed = null as unknown as Parameters<typeof actions.passkeyLoginVerifyAction>[0];
    expect(await actions.passkeyLoginVerifyAction(malformed)).toEqual({
      error: "That passkey isn't registered for this admin.",
    });
    expect(state.failures).toEqual([KEY]);
  });

  it("refuses an address that isn't this site", async () => {
    state.host = "georgianartist.com.evil.example";
    expect(await actions.passkeyLoginVerifyAction(answer())).toEqual({ error: "Passkeys can't be used on this address." });
    expect(state.session.isLoggedIn).toBeUndefined();
  });
});

describe("registering a passkey", () => {
  beforeEach(() => {
    state.session = { saves: 0, isLoggedIn: true, passkeyChallenge: "register-challenge", passkeyChallengeAt: Date.now() - 1000 };
  });

  it("needs a signed-in admin for every step", async () => {
    state.signedIn = false;
    await expect(actions.passkeyRegisterOptionsAction()).rejects.toThrow("NEXT_REDIRECT");
    await expect(actions.passkeyRegisterVerifyAction(regAnswer, "Phone")).rejects.toThrow("NEXT_REDIRECT");
    await expect(actions.deletePasskeyAction("cred-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(state.creates).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("asks for a discoverable passkey that requires the person, excluding ones already registered", async () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    expect(await actions.passkeyRegisterOptionsAction()).toEqual({ options: { challenge: "register-challenge" } });
    expect(state.optionArgs[0]).toMatchObject({
      rpName: siteConfig.brand,
      rpID: "georgianartist.com",
      userName: "admin",
      userDisplayName: `${siteConfig.brand} admin`,
      attestationType: "none",
      excludeCredentials: [{ id: "cred-1", transports: ["internal", "hybrid"] }],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    expect(state.session).toMatchObject({ passkeyChallenge: "register-challenge", passkeyChallengeAt: 1_700_000_000_000 });
    expect(state.session.saves).toBe(1);
  });

  it("excludes a stored passkey without transports as just its id", async () => {
    state.stored[0]!.transports = null;
    await actions.passkeyRegisterOptionsAction();
    expect(state.optionArgs[0]!.excludeCredentials).toEqual([{ id: "cred-1", transports: undefined }]);
  });

  it("stores a verified passkey, with a trimmed label", async () => {
    expect(await actions.passkeyRegisterVerifyAction(regAnswer, "  Studio Mac  ")).toEqual({ ok: true });
    expect(state.regArgs[0]).toMatchObject({
      expectedChallenge: "register-challenge",
      expectedOrigin: "https://www.georgianartist.com",
      expectedRPID: "georgianartist.com",
      requireUserVerification: true,
    });
    expect(state.creates).toEqual([
      {
        id: "cred-new",
        publicKey: "AQID",
        counter: 0,
        transports: "internal",
        label: "Studio Mac",
        deviceType: "multiDevice",
        backedUp: true,
      },
    ]);
    expect(state.revalidated).toEqual(["/admin/security"]);
    expect(state.session.passkeyChallenge).toBeUndefined();
  });

  it("names an unlabelled passkey, cuts a long label, and stores no empty transports", async () => {
    state.verifyReg = () => ({
      verified: true,
      registrationInfo: {
        credential: { id: "c", publicKey: new Uint8Array([1]), counter: 0, transports: [] },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    });
    await actions.passkeyRegisterVerifyAction(regAnswer, "");
    state.session.passkeyChallenge = "register-challenge";
    state.session.passkeyChallengeAt = Date.now();
    await actions.passkeyRegisterVerifyAction(regAnswer, "x".repeat(80));
    expect(state.creates.map((c) => c.label)).toEqual(["Passkey", "x".repeat(60)]);
    expect(state.creates[0]!.transports).toBeNull();
  });

  it.each([
    [["usb", "nfc"], "usb,nfc"],
    [undefined, null],
  ])("stores transports %j as %j", async (transports, stored) => {
    state.verifyReg = () => ({
      verified: true,
      registrationInfo: {
        credential: { id: "c", publicKey: new Uint8Array([1]), counter: 0, transports },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    });
    expect(await actions.passkeyRegisterVerifyAction(regAnswer, "Key")).toEqual({ ok: true });
    expect(state.creates[0]!.transports).toBe(stored);
  });

  it.each([
    ["isn't verified", () => ({ verified: false, registrationInfo: {} }), "The passkey couldn't be verified."],
    ["comes back without its details", () => ({ verified: true }), "The passkey couldn't be verified."],
    [
      "makes the library throw",
      () => {
        throw new Error("bad attestation");
      },
      "The passkey couldn't be registered.",
    ],
  ])("stores nothing when the answer %s", async (_, verify, error) => {
    state.verifyReg = verify;
    expect(await actions.passkeyRegisterVerifyAction(regAnswer, "Phone")).toEqual({ error });
    expect(state.creates).toEqual([]);
    expect(state.revalidated).toEqual([]);
  });

  it("refuses a stale or missing challenge, and uses it once", async () => {
    state.session.passkeyChallengeAt = Date.now() - 6 * 60_000;
    expect(await actions.passkeyRegisterVerifyAction(regAnswer, "Phone")).toEqual({
      error: "That took too long. Please try again.",
    });
    expect(state.session.passkeyChallenge).toBeUndefined();
    expect(state.session.saves).toBe(1);
    expect(await actions.passkeyRegisterVerifyAction(regAnswer, "Phone")).toEqual({
      error: "That took too long. Please try again.",
    });
    expect(state.regArgs).toEqual([]);
  });

  it.each([
    ["for options", () => actions.passkeyRegisterOptionsAction()],
    ["to register", () => actions.passkeyRegisterVerifyAction(regAnswer, "Phone")],
  ])("refuses an address that isn't this site %s", async (_, call) => {
    state.host = "evil.example";
    expect(await call()).toEqual({ error: "Passkeys can't be registered on this address." });
    expect(state.creates).toEqual([]);
  });

  it("removes a passkey, and doesn't fail if it was already gone", async () => {
    await expect(actions.deletePasskeyAction("cred-1")).resolves.toBeUndefined();
    expect(state.deletes).toEqual([{ where: { id: "cred-1" } }]);
    expect(state.revalidated).toEqual(["/admin/security"]);
  });
});

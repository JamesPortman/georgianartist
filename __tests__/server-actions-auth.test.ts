import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Every server action refuses a caller with no admin session, before touching
 * anything. A server action is a public HTTP endpoint (Next exposes every
 * export of a "use server" file), so a missing requireAuth() is an open door
 * to the catalogue, the Instagram account or the passkeys, whatever the admin
 * UI shows.
 *
 * This calls every exported action for real, with no session, a database that
 * records any access, and Blob, email and Anthropic stubbed. New actions are
 * picked up automatically; only the sign-in flows below may run without one.
 */

const touched = vi.hoisted(() => ({ db: [] as string[] }));

vi.mock("@/lib/session", () => ({
  getAdminSession: async () => ({ isLoggedIn: false, save: async () => {}, destroy: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
}));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn(), head: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/db", () => {
  const record = (path: string): unknown =>
    new Proxy(() => {}, {
      get: (_t, key) => (typeof key === "string" ? record(`${path}.${key}`) : undefined),
      apply: () => {
        touched.db.push(path);
        return Promise.resolve(null);
      },
    });
  return { prisma: record("prisma") };
});

const MODULES = {
  admin: () => import("../app/actions/admin"),
  instagram: () => import("../app/actions/instagram"),
  analytics: () => import("../app/actions/analytics"),
  passkey: () => import("../app/actions/passkey"),
};

/** Allowed without a session, and why. */
const PUBLIC: Record<string, string> = {
  loginAction: "signing in is how a session starts",
  logoutAction: "ending a session needs none",
  passkeyLoginOptionsAction: "the passkey sign-in challenge",
  passkeyLoginVerifyAction: "passkey sign-in itself",
  requireAuth: "the check itself",
};

beforeEach(() => {
  touched.db.length = 0;
});

describe("server actions without a session", () => {
  for (const [file, load] of Object.entries(MODULES)) {
    it(`app/actions/${file}.ts: every action sends a caller with no session to sign in, untouched`, async () => {
      const mod = (await load()) as Record<string, unknown>;
      const actions = Object.entries(mod).filter(([name, fn]) => typeof fn === "function" && !(name in PUBLIC));
      expect(actions.length).toBeGreaterThan(0);

      for (const [name, fn] of actions) {
        touched.db.length = 0;
        const form = new FormData();
        form.set("title", "x");
        const call = (fn as (...a: unknown[]) => Promise<unknown>)("lora-bay", form, "x");
        await expect(call, `${name} ran without a session`).rejects.toThrow("REDIRECT:/admin/login");
        expect(touched.db, `${name} reached the database before checking the session`).toEqual([]);
      }
    });
  }

  it("the sign-in actions are the only ones exempt, and still exist", async () => {
    const all = Object.assign({}, ...(await Promise.all(Object.values(MODULES).map((l) => l()))));
    for (const name of Object.keys(PUBLIC)) expect(typeof all[name], name).toBe("function");
  });
});

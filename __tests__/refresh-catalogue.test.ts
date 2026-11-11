import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * "Refresh site" in the admin expires every cached catalogue read, for changes
 * made outside the admin. Without a session it does nothing at all.
 */

const state = vi.hoisted(() => ({ loggedIn: true, tags: [] as string[], paths: [] as unknown[][] }));

vi.mock("@/lib/session", () => ({
  getAdminSession: async () => ({ isLoggedIn: state.loggedIn, save: async () => {}, destroy: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/cache", () => ({
  updateTag: (t: string) => state.tags.push(t),
  revalidatePath: (...a: unknown[]) => state.paths.push(a),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));

const { refreshCatalogueAction } = await import("../app/actions/admin");
const { CATALOGUE_TAG } = await import("../lib/catalogue-tag");

beforeEach(() => {
  state.loggedIn = true;
  state.tags = [];
  state.paths = [];
});

describe("refreshCatalogueAction", () => {
  it("expires the catalogue tag and every page under the root layout", async () => {
    await refreshCatalogueAction();
    expect(state.tags).toEqual([CATALOGUE_TAG]);
    expect(state.paths).toEqual([["/", "layout"]]);
  });

  it("sends a caller with no session to sign in, and expires nothing", async () => {
    state.loggedIn = false;
    await expect(refreshCatalogueAction()).rejects.toThrow("REDIRECT:/admin/login");
    expect(state.tags).toEqual([]);
    expect(state.paths).toEqual([]);
  });
});

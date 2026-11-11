import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Reordering the catalogue is one statement, applied whole or not at all. It
 * used to be a loop of single updates, and a failure halfway left the gallery
 * in an order nobody chose.
 */

const db = vi.hoisted(() => ({ statements: [] as string[], values: [] as unknown[][] }));

vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      db.statements.push(strings.join("?"));
      db.values.push(values);
      return values.length;
    },
    product: { update: async () => { throw new Error("should not update rows one at a time"); } },
  },
}));
vi.mock("@/lib/session", () => ({ getAdminSession: async () => ({ isLoggedIn: true }) }));
const updateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));
vi.mock("@vercel/blob", () => ({ put: async () => ({ url: "" }) }));

const { reorderProductsAction } = await import("../app/actions/admin");

beforeEach(() => {
  db.statements.length = 0;
  db.values.length = 0;
});

describe("reorderProductsAction", () => {
  it("writes the whole order in a single UPDATE … FROM (VALUES …)", async () => {
    await reorderProductsAction(["lora-bay", "council-beach", "scenic-caves"]);
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]).toMatch(/UPDATE "Product"[\s\S]*FROM \(VALUES/);
    // The public pages read the order through the catalogue cache.
    expect(updateTag).toHaveBeenCalledWith("catalogue");
  });

  it("does nothing for an empty list rather than sending an empty VALUES", async () => {
    await reorderProductsAction([]);
    expect(db.statements).toHaveLength(0);
  });
});

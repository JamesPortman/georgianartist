import { describe, it, expect, vi, beforeEach } from "vitest";
import { productPath, productSlug, slugProblem } from "../lib/product-path";

/**
 * A work's id is permanent; its URL is its slug. Renaming a work moves its page
 * and leaves the old slug in ProductSlug, which redirects, so links already in
 * the world (Google, Instagram captions, emails) keep landing on the work.
 */

const db = vi.hoisted(() => ({
  products: [] as { id: string; slug: string | null; type: string; visible: boolean }[],
  history: [] as { slug: string; productId: string }[],
}));

type Where = {
  type?: string;
  visible?: boolean;
  id?: string;
  OR?: ({ slug: string } | { slug: null; id: string })[];
  NOT?: { id: string };
};
const matches = (p: (typeof db.products)[number], w: Where) =>
  (w.type === undefined || p.type === w.type) &&
  (w.visible === undefined || p.visible === w.visible) &&
  (w.id === undefined || p.id === w.id) &&
  (w.NOT === undefined || p.id !== w.NOT.id) &&
  (w.OR === undefined ||
    w.OR.some((c) => ("id" in c ? p.slug === null && p.id === c.id : p.slug === c.slug)));

vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findFirst: async ({ where }: { where: Where }) => db.products.find((p) => matches(p, where)) ?? null },
    productSlug: {
      findUnique: async ({ where }: { where: { slug: string } }) => db.history.find((h) => h.slug === where.slug) ?? null,
    },
  },
}));

const { findWorkBySlug, slugTakenBy } = await import("../lib/product-lookup");

beforeEach(() => {
  db.products = [
    { id: "spirit-rock", slug: "near-killarney", type: "painting", visible: true },
    { id: "lora-bay", slug: null, type: "painting", visible: true },
    { id: "delphi-point", slug: null, type: "photograph", visible: true },
    { id: "old-hidden", slug: "hidden-now", type: "painting", visible: false },
  ];
  db.history = [
    { slug: "spirit-rock", productId: "spirit-rock" },
    { slug: "was-hidden", productId: "old-hidden" },
  ];
});

describe("productPath", () => {
  it("serves a never-renamed work at its id, and a renamed one at its slug", () => {
    expect(productPath({ id: "lora-bay", type: "painting" })).toBe("/products/lora-bay");
    expect(productPath({ id: "spirit-rock", slug: "near-killarney", type: "painting" })).toBe("/products/near-killarney");
    expect(productPath({ id: "delphi-point", slug: null, type: "photograph" })).toBe("/photographs/delphi-point");
    expect(productSlug({ id: "x", slug: null })).toBe("x");
  });
});

describe("slugProblem", () => {
  it.each(["lora-bay", "a", "blue-mountain-sunset-2"])("accepts %s", (s) => expect(slugProblem(s)).toBeNull());
  it.each(["", "Lora-Bay", "lora bay", "lora--bay", "-lora", "lora-", "lora/bay", "x".repeat(81)])(
    "refuses %j",
    (s) => expect(slugProblem(s)).not.toBeNull()
  );
  it("accepts a slug of exactly 80 characters, and says why it refuses", () => {
    expect(slugProblem("x".repeat(80))).toBeNull();
    expect(slugProblem("")).toBe("The URL slug can't be empty.");
    expect(slugProblem("x".repeat(81))).toBe("The URL slug can be at most 80 characters.");
    expect(slugProblem("Lora-Bay")).toBe(
      "The URL slug can only use lowercase letters, digits and single hyphens, e.g. lora-bay-at-dawn."
    );
  });
});

describe("findWorkBySlug", () => {
  it("finds a renamed work by its new slug", async () => {
    expect((await findWorkBySlug("near-killarney", "painting")).work?.id).toBe("spirit-rock");
  });

  it("finds a never-renamed work by its id", async () => {
    expect((await findWorkBySlug("lora-bay", "painting")).work?.id).toBe("lora-bay");
  });

  it("redirects a retired slug to the work's current page", async () => {
    expect(await findWorkBySlug("spirit-rock", "painting")).toEqual({ work: null, redirect: "/products/near-killarney" });
  });

  it("does not serve a renamed work at its id any more; that is the retired slug's job", async () => {
    // spirit-rock is also the id, but the id no longer names the page.
    expect((await findWorkBySlug("spirit-rock", "painting")).work).toBeNull();
  });

  it("is a 404 for a retired slug whose work is hidden, not a redirect to a page that 404s", async () => {
    expect(await findWorkBySlug("was-hidden", "painting")).toEqual({ work: null, redirect: null });
  });

  it("keeps paintings and photographs apart for current slugs", async () => {
    expect((await findWorkBySlug("delphi-point", "painting")).work).toBeNull();
  });
});

describe("slugTakenBy", () => {
  it("refuses another work's current slug, or its id when never renamed", async () => {
    expect(await slugTakenBy("near-killarney", "lora-bay")).toBe("spirit-rock");
    expect(await slugTakenBy("lora-bay", "spirit-rock")).toBe("lora-bay");
  });

  it("refuses another work's retired slug, which would take over its old links", async () => {
    expect(await slugTakenBy("spirit-rock", "lora-bay")).toBe("spirit-rock");
  });

  it("lets a work take back one of its own retired slugs", async () => {
    expect(await slugTakenBy("spirit-rock", "spirit-rock")).toBeNull();
  });

  it("allows a slug nothing uses", async () => {
    expect(await slugTakenBy("lora-bay-at-dawn", "lora-bay")).toBeNull();
  });
});

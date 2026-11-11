import { describe, it, expect } from "vitest";
import { resolveOrder, CARDS, MONTHS, type WorkLookup } from "../lib/order";
import { giftShopProducts } from "../data/giftShop";
import { sizeOptions } from "../data/products";

/**
 * The server decides what an order is. Whatever title, size or price the
 * browser claims is ignored — only ids and choices are read, and anything
 * that isn't a real, visible, available work at a real size is refused.
 */

type W = { id: string; title: string; sizeType: string; visible: boolean; soldOut: boolean };
const catalogue: W[] = [
  { id: "lora-bay", title: "Lora Bay", sizeType: "landscape", visible: true, soldOut: false },
  { id: "lone-tree", title: "Lone Tree", sizeType: "square", visible: true, soldOut: true },
  { id: "hidden-one", title: "Hidden", sizeType: "landscape", visible: false, soldOut: false },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `w${i}`, title: `Work ${i}`, sizeType: "landscape", visible: true, soldOut: false,
  })),
];
const works: WorkLookup = {
  one: async (id) => catalogue.find((w) => w.id === id) ?? null,
  many: async (ids) => catalogue.filter((w) => ids.includes(w.id)),
};
const landscape = sizeOptions.landscape[1];

describe("resolveOrder: prints", () => {
  it("takes the title and price from the catalogue and the price table", async () => {
    const r = await resolveOrder({ kind: "print", productId: "lora-bay", size: landscape!.label }, works);
    expect(r).toEqual({
      ok: true,
      order: { title: "Lora Bay", sizeLabel: landscape!.label, price: landscape!.salePrice },
    });
  });

  it("ignores a title and price smuggled in beside the ids", async () => {
    const r = await resolveOrder(
      { kind: "print", productId: "lora-bay", size: landscape!.label, title: "Pay at evil.example", price: 1 },
      works
    );
    expect(r.ok && r.order.title).toBe("Lora Bay");
    expect(r.ok && r.order.price).toBe(landscape!.salePrice);
  });

  it("marks a frame quote the way the page does", async () => {
    const r = await resolveOrder(
      { kind: "print", productId: "lora-bay", size: landscape!.label, framed: true },
      works
    );
    expect(r.ok && r.order.title).toBe("Lora Bay (+ frame quote)");
    expect(r.ok && r.order.sizeLabel).toBe(`${landscape!.label} (frame quote requested)`);
  });

  it("refuses a size this work isn't offered in", async () => {
    const square = sizeOptions.square[0].label;
    expect((await resolveOrder({ kind: "print", productId: "lora-bay", size: square }, works)).ok).toBe(false);
    expect((await resolveOrder({ kind: "print", productId: "lora-bay", size: "any text" }, works)).ok).toBe(false);
  });

  it.each(["lone-tree", "hidden-one", "no-such-work"])("refuses %s (sold out, hidden or unknown)", async (id) => {
    const r = await resolveOrder({ kind: "print", productId: id, size: landscape!.label }, works);
    expect(r.ok).toBe(false);
  });
});

describe("resolveOrder: single cards", () => {
  it.each(["greeting", "postcard"] as const)("prices a %s card from the fixed table", async (card) => {
    const r = await resolveOrder({ kind: "card", productId: "lora-bay", card }, works);
    expect(r).toEqual({
      ok: true,
      order: { title: "Lora Bay", sizeLabel: CARDS[card].label, price: CARDS[card].price },
    });
  });

  it("refuses an unknown card type and a sold-out work", async () => {
    expect((await resolveOrder({ kind: "card", productId: "lora-bay", card: "poster" }, works)).ok).toBe(false);
    expect((await resolveOrder({ kind: "card", productId: "lone-tree", card: "postcard" }, works)).ok).toBe(false);
  });
});

describe("resolveOrder: gift packs", () => {
  const calendar = giftShopProducts.find((p) => p.id === "calendar")!;
  const twelve = Array.from({ length: 12 }, (_, i) => `w${i}`);

  it("builds the month list from catalogue titles, in the order chosen", async () => {
    const r = await resolveOrder({ kind: "pack", packId: "calendar", imageIds: twelve }, works);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.order.price).toBe(calendar.priceCAD);
    expect(r.order.details).toContain("January: Work 0");
    expect(r.order.details).toContain("December: Work 11");
  });

  it("refuses the wrong number of images, repeats, and unavailable ones", async () => {
    const bad = [
      twelve.slice(1),
      [...twelve.slice(1), "w1"],
      [...twelve.slice(1), "lone-tree"],
      [...twelve.slice(1), "hidden-one"],
    ];
    for (const imageIds of bad) {
      expect((await resolveOrder({ kind: "pack", packId: "calendar", imageIds }, works)).ok).toBe(false);
    }
  });

  it("refuses an unknown pack", async () => {
    expect((await resolveOrder({ kind: "pack", packId: "free-stuff", imageIds: twelve }, works)).ok).toBe(false);
  });
});

describe("resolveOrder: malformed input", () => {
  it.each([null, "print", {}, { kind: "print" }, { kind: "refund" }])("refuses %j", async (input) => {
    expect((await resolveOrder(input, works)).ok).toBe(false);
  });
});

/**
 * Why an order is refused, not only that it is. Mutation testing (Stryker)
 * found the tests above passed with whole checks deleted, because a later
 * check refused the same order for a different reason. The reason is what the
 * buyer is shown, so each refusal is pinned to its own.
 */
describe("resolveOrder: the reason given", () => {
  const twelve = Array.from({ length: 12 }, (_, i) => `w${i}`);
  const reason = async (input: unknown, lookup = works) => {
    const r = await resolveOrder(input, lookup);
    return r.ok ? "accepted" : r.reason;
  };

  it.each([
    ["no order", null],
    ["a string", "print"],
    ["an unknown kind", { kind: "refund", packId: "calendar", imageIds: twelve }],
    ["a print with no work", { kind: "print", size: landscape!.label }],
    ["a print with an empty id", { kind: "print", productId: "", size: landscape!.label }],
    ["a print with no size", { kind: "print", productId: "lora-bay" }],
    ["an id over 200 characters", { kind: "print", productId: "x".repeat(201), size: landscape!.label }],
    ["a card with no work", { kind: "card", card: "postcard" }],
    ["a pack whose images aren't a list", { kind: "pack", packId: "calendar", imageIds: "w0" }],
    ["a pack with a non-text image id", { kind: "pack", packId: "calendar", imageIds: [...twelve.slice(1), 7] }],
  ])("%s: Missing order", async (_, input) => {
    expect(await reason(input)).toBe("Missing order");
  });

  it("accepts an id of exactly 200 characters", async () => {
    const id = "x".repeat(200);
    const lookup: WorkLookup = {
      one: async (wanted) => (wanted === id ? { ...catalogue[0]!, id } : null),
      many: async () => [],
    };
    expect(await reason({ kind: "print", productId: id, size: landscape!.label }, lookup)).toBe("accepted");
  });

  it("names an unavailable work, an unoffered size and an unknown pack", async () => {
    expect(await reason({ kind: "print", productId: "lone-tree", size: landscape!.label })).toBe(
      "That work isn't available to order"
    );
    expect(await reason({ kind: "card", productId: "hidden-one", card: "postcard" })).toBe(
      "That work isn't available to order"
    );
    expect(await reason({ kind: "print", productId: "lora-bay", size: "any text" })).toBe(
      "That size isn't offered for this work"
    );
    expect(await reason({ kind: "pack", packId: "free-stuff", imageIds: twelve })).toBe("Unknown gift-shop product");
  });

  it("refuses a work whose size type has no price table, without throwing", async () => {
    const lookup: WorkLookup = {
      one: async () => ({ ...catalogue[0]!, sizeType: "mural" }),
      many: async () => [],
    };
    expect(await reason({ kind: "print", productId: "lora-bay", size: landscape!.label }, lookup)).toBe(
      "That size isn't offered for this work"
    );
  });

  it("asks for the right number of different images before looking any up", async () => {
    const choose = "Choose 12 different images";
    expect(await reason({ kind: "pack", packId: "calendar", imageIds: twelve.slice(1) })).toBe(choose);
    expect(await reason({ kind: "pack", packId: "calendar", imageIds: [...twelve.slice(1), "w1"] })).toBe(choose);
    expect(await reason({ kind: "pack", packId: "calendar", imageIds: [...twelve.slice(1), "lone-tree"] })).toBe(
      "One of those images isn't available"
    );
  });

  it("lists a calendar by month, all twelve, in the order chosen", async () => {
    const r = await resolveOrder({ kind: "pack", packId: "calendar", imageIds: twelve }, works);
    expect(r.ok && r.order.details).toBe(
      ["Calendar months (12 photos):", ...MONTHS.map((m, i) => `  ${m}: Work ${i}`)].join("\n")
    );
    expect(MONTHS).toEqual([
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ]);
  });

  it("numbers any other pack's images from 1, and names the pack", async () => {
    const pack = giftShopProducts.find((p) => p.id === "card-pack")!;
    const six = twelve.slice(0, 6);
    const r = await resolveOrder({ kind: "pack", packId: "card-pack", imageIds: six }, works);
    expect(r).toEqual({
      ok: true,
      order: {
        title: pack.title,
        sizeLabel: `6-image ${pack.shortTitle}`,
        price: pack.priceCAD,
        details: [`${pack.title} selections (6):`, ...six.map((_, i) => `  #${i + 1}: Work ${i}`)].join("\n"),
      },
    });
  });
});

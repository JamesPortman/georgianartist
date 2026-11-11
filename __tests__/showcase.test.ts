import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
const { distinctShowcases } = await import("../lib/showcase");
const { giftShopProducts } = await import("../data/giftShop");

const works = ["lora-bay", "council-beach", "local-farm-painting", "top-of-blue-mountain", "the-grotto"].map(
  (id) => ({ id, title: id, image: `/paintings/${id}.jpg` })
);
const slots = giftShopProducts.map((p) => ({ key: p.id, preferred: p.showcase }));

describe("distinctShowcases", () => {
  it("gives every gift-shop card a different work", () => {
    const ids = distinctShowcases(works, slots).map((w) => w!.id);
    expect(new Set(ids).size).toBe(slots.length);
  });

  it("uses the calendar's chosen painting while it's for sale", () => {
    expect(distinctShowcases(works, slots)[0]!.id).toBe("council-beach");
  });

  it("falls back to an automatic pick once that painting is hidden or sold out", () => {
    // getVisibleWorks leaves it out, so it simply isn't in the list.
    const without = works.filter((w) => w.id !== "council-beach");
    const picked = distinctShowcases(without, slots);
    expect(picked.every(Boolean)).toBe(true);
    expect(new Set(picked.map((w) => w!.id)).size).toBe(slots.length);
  });

  it("is stable: the same catalogue gives the same picks", () => {
    expect(distinctShowcases(works, slots)).toEqual(distinctShowcases(works, slots));
  });

  it("repeats only when there are fewer works than cards, and never crashes on none", () => {
    expect(distinctShowcases(works.slice(0, 1), slots).map((w) => w!.id)).toEqual(Array(slots.length).fill(works[0]!.id));
    expect(distinctShowcases([], slots)).toEqual(slots.map(() => null));
  });

  it("names the preference by product id, never by image path", () => {
    for (const p of giftShopProducts) if (p.showcase) expect(p.showcase).not.toMatch(/[/.]/);
  });
});

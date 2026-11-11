import { describe, it, expect } from "vitest";
import {
  buildProductContext,
  captionPriceIsStale,
  priceRangeFor,
  type PostProductData,
} from "../lib/instagram";
import { sizeOptions, type SizeType } from "../data/products";

/**
 * The price line in a caption is published unedited and can't be corrected
 * once it's public. It went out wrong for weeks: the range was built from the
 * SALE floor and the REGULAR ceiling, so an ultrawide read "CA$89–CA$435" when
 * the actual choice on sale is CA$89–279. Nobody could pay either end against
 * the other. Already-posted captions carry it (lora-bay CA$89–469, delphi-point
 * CA$89–469, singhampton-winter CA$99–399).
 */

const product = (sizeType: SizeType): PostProductData => ({
  id: "test-work",
  title: "Test Work",
  type: "painting",
  category: "Georgian Bay",
  sizeType,
  price: 119,
  description: "A test work.",
  image: "/paintings/test-work.jpg",
});

const rangeIn = (context: string): [number, number] => {
  const m = context.match(/Price range: CA\$(\d+)–CA\$(\d+)/);
  if (!m) throw new Error(`no two-ended price range in:\n${context}`);
  return [Number(m[1]), Number(m[2])];
};

const sizeTypes = Object.keys(sizeOptions) as SizeType[];

describe("buildProductContext price range", () => {
  it.each(sizeTypes)("quotes %s from one scale, not sale-floor to regular-ceiling", (sizeType) => {
    const [low, high] = rangeIn(buildProductContext(product(sizeType)));
    const sale = sizeOptions[sizeType].map((s) => s.salePrice);

    expect(low).toBe(Math.min(...sale));
    expect(high).toBe(Math.max(...sale));
  });

  it.each(sizeTypes)("never quotes a %s regular price as the ceiling", (sizeType) => {
    const [, high] = rangeIn(buildProductContext(product(sizeType)));
    const regularCeiling = Math.max(...sizeOptions[sizeType].map((s) => s.regularPrice));

    // The exact shape of the old bug: the top of the range was the undiscounted
    // price while the bottom was the discounted one.
    expect(high).not.toBe(regularCeiling);
  });

  it("matches what the ultrawide detail page shows a buyer", () => {
    // Regression fixture for the caption that started this: Scenic Caves.
    expect(buildProductContext(product("ultrawide"))).toContain("Price range: CA$89–CA$279");
  });

  it("falls back to the product's own price when there is only one size", () => {
    const single = { ...product("landscape"), sizeType: "unknown-type", price: 149 };
    expect(buildProductContext(single)).toContain("Price range: CA$149");
  });
});

describe("captionPriceIsStale", () => {
  const caption = (range: string) =>
    `Scenic Caves at first light.\n\nArchival canvas, ${range}.\n\n#georgianbay`;

  it("catches the exact bug that shipped; sale floor against regular ceiling", () => {
    // ultrawide: sale 89–279, regular 139–435
    expect(captionPriceIsStale(caption("CA$89–CA$435"), "ultrawide", 89)).toBe(true);
  });

  it("passes a caption that quotes the current range", () => {
    expect(captionPriceIsStale(caption("CA$89–CA$279"), "ultrawide", 89)).toBe(false);
  });

  it.each([
    "CA$119–$299",
    "CA$119-299",
    "CA$119 – CA$299",
    "CA$119—299",
  ])("reads a price range as the same claim, however Claude punctuated it (case %#)", (range) => {
    // landscape: sale 119–299
    expect(captionPriceIsStale(caption(range), "landscape", 119)).toBe(false);
  });

  it("leaves a caption that names no range alone", () => {
    expect(captionPriceIsStale("Just a story about the bay. #georgianbay", "landscape", 119)).toBe(false);
  });

  it("does not treat a single-size work's flat price as a stale range", () => {
    expect(captionPriceIsStale("Prints from CA$149. #georgianbay", "unknown-type", 149)).toBe(false);
  });

  it.each(sizeTypes)("flags the old range for every %s work in the queue", (sizeType) => {
    const opts = sizeOptions[sizeType];
    const old = `CA$${Math.min(...opts.map((s) => s.salePrice))}–CA$${Math.max(
      ...opts.map((s) => s.regularPrice)
    )}`;
    const fixed = priceRangeFor(sizeType, 0);
    // Only meaningful where the two differ — they do for every size family.
    expect(old).not.toBe(fixed);
    expect(captionPriceIsStale(caption(old), sizeType, 0)).toBe(true);
    expect(captionPriceIsStale(caption(fixed), sizeType, 0)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { deriveSizeType, standardPrice, slugify, inchesToCm, sizeLabelWithCm } from "../lib/product-utils";
import { sizeOptions } from "../data/products";

describe("deriveSizeType", () => {
  it("classifies by aspect ratio", () => {
    expect(deriveSizeType(2000, 1000)).toBe("panoramic"); // r = 2.0
    expect(deriveSizeType(2400, 1800)).toBe("landscape"); // r ≈ 1.33
    expect(deriveSizeType(1000, 1000)).toBe("square"); // r = 1.0
    expect(deriveSizeType(1200, 1600)).toBe("portrait"); // r = 0.75
  });

  it("uses correct boundaries", () => {
    expect(deriveSizeType(180, 100)).toBe("panoramic"); // r = 1.8 (inclusive)
    expect(deriveSizeType(179, 100)).toBe("landscape"); // r = 1.79
    expect(deriveSizeType(115, 100)).toBe("landscape"); // r = 1.15 (inclusive)
    expect(deriveSizeType(114, 100)).toBe("square"); // r = 1.14
    expect(deriveSizeType(87, 100)).toBe("square"); // r = 0.87 (inclusive)
    expect(deriveSizeType(86, 100)).toBe("portrait"); // r = 0.86
  });

  it("falls back to the first available type when the guess isn't offered", () => {
    // "panoramic" not available → first of the list
    expect(deriveSizeType(2000, 1000, ["square", "portrait"])).toBe("square");
    // guess is available → keep it
    expect(deriveSizeType(2000, 1000, ["landscape", "panoramic"])).toBe("panoramic");
  });
});

describe("standardPrice", () => {
  it("returns the lowest sale price for a size type", () => {
    for (const [type, opts] of Object.entries(sizeOptions)) {
      const expected = Math.min(...opts.map((o) => o.salePrice));
      expect(standardPrice(type)).toBe(expected);
    }
  });

  it("returns a positive price for every known size type", () => {
    for (const type of Object.keys(sizeOptions)) {
      expect(standardPrice(type)).toBeGreaterThan(0);
    }
  });

  it("returns 0 for an unknown size type", () => {
    expect(standardPrice("nonsense")).toBe(0);
  });
});

describe("standardPrice of a name Object.prototype holds", () => {
  it("is 0, not a TypeError", () => {
    for (const name of ["valueOf", "__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(standardPrice(name)).toBe(0);
    }
  });
});

describe("slugify", () => {
  it("produces URL-safe, lowercase, hyphenated ids", () => {
    expect(slugify("Council Beach")).toBe("council-beach");
    expect(slugify("2 Panels: Scenic Caves!")).toBe("2-panels-scenic-caves");
    expect(slugify("  Trailing — Spaces  ")).toBe("trailing-spaces");
    expect(slugify("Northwinds @ Twilight")).toBe("northwinds-twilight");
  });

  it("never returns an empty slug", () => {
    expect(slugify("!!!")).toBe("product");
    expect(slugify("")).toBe("product");
  });

  it("never ends in a hyphen when the 60-character cut lands after a word", () => {
    const title = `${"a".repeat(59)} lighthouse`; // the cut falls on the space
    expect(slugify(title)).toBe("a".repeat(59));
    expect(slugify(`${"b".repeat(30)} ${"c".repeat(40)}`)).toBe(`${"b".repeat(30)}-${"c".repeat(29)}`);
  });

  it("always yields a value matching the product ID pattern", () => {
    for (const title of ["A B C", "Lake Huron Shore", "café del mar", "123"]) {
      expect(slugify(title)).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("sizeLabelWithCm", () => {
  it("rounds inches to whole centimetres", () => {
    expect(inchesToCm(12)).toBe(30);
    expect(inchesToCm(16)).toBe(41);
    expect(inchesToCm(40)).toBe(102);
  });

  it("adds the centimetres in the label's height × width order", () => {
    expect(sizeLabelWithCm({ label: '12" × 16"', width: 16, height: 12 })).toBe('12" × 16" (30 × 41 cm)');
    expect(sizeLabelWithCm({ label: '16" × 12"', width: 12, height: 16 })).toBe('16" × 12" (41 × 30 cm)');
  });

  it("keeps an existing note inside the same brackets", () => {
    expect(sizeLabelWithCm({ label: '16" × 32" (2 panels)', width: 32, height: 16 })).toBe(
      '16" × 32" (41 × 81 cm, 2 panels)',
    );
  });

  // The centimetres come from width and height, the inches from the label; if a
  // label and its dimensions ever disagreed, the page would quote two sizes.
  it("matches every label's inches for every size sold", () => {
    for (const sizes of Object.values(sizeOptions)) {
      for (const size of sizes) {
        const [h, w] = size.label.match(/\d+/g)!.map(Number);
        expect([h, w], size.label).toEqual([size.height, size.width]);
        expect(sizeLabelWithCm(size)).toContain(`(${inchesToCm(size.height)} × ${inchesToCm(size.width)} cm`);
      }
    }
  });
});

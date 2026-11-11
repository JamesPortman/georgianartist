import { describe, it, expect } from "vitest";
import {
  SOLD_OUT_FILTER,
  excludesSoldOut,
  matchesAvailability,
  soldOutLast,
  soldOutMatches,
  availabilitySchema,
} from "../lib/availability";

/**
 * Sold-out work is in the gallery, but never mistaken for work for sale.
 *
 * It used to be hidden from every view except its own filter. That was safe,
 * and it also buried the collectors' photos that only sold-out paintings
 * carry. Now it appears in All and in each category — after everything for
 * sale, and marked — and stays out of the two views whose whole point is
 * buying: New and On sale.
 *
 * The expensive mistake still has a direction. A sold-out piece presented as
 * buyable takes an order that cannot be filled. So the cases below pin both
 * halves: where it may appear, and that it can never sit among work for sale.
 */

const available = { soldOut: false, title: "Council Beach" };
const soldOutWork = { soldOut: true, title: "Delphi Point" };
// A row written before the column existed: no `soldOut` key at all.
const legacy: { soldOut?: boolean; title: string } = { title: "Lora Bay" };

describe("matchesAvailability", () => {
  it("includes sold-out work in the main gallery", () => {
    // Where a casual visitor actually looks. The collector's photos live on
    // these pages, and a work nobody can find persuades nobody.
    expect(matchesAvailability(soldOutWork, null)).toBe(true);
    expect(matchesAvailability(available, null)).toBe(true);
  });

  it("includes it in a category view too", () => {
    // Otherwise "All" shows a painting that its own category hides.
    expect(matchesAvailability(soldOutWork, "Bruce Peninsula")).toBe(true);
    expect(matchesAvailability(available, "Bruce Peninsula")).toBe(true);
  });

  it.each(["__new__", "__sale__"])("keeps it out of the %s view", (pseudo) => {
    // Belt and braces: a sold-out piece left flagged New or On Sale in the
    // admin must not reappear through the pseudo-category that flag drives.
    expect(matchesAvailability(soldOutWork, pseudo)).toBe(false);
  });

  it("shows only sold-out work in the archive view", () => {
    expect(matchesAvailability(soldOutWork, SOLD_OUT_FILTER)).toBe(true);
    expect(matchesAvailability(available, SOLD_OUT_FILTER)).toBe(false);
  });

  it("treats a missing flag as available", () => {
    // `soldOut` is optional on the type and defaults false in the database, so
    // every row that predates the column must keep selling.
    expect(matchesAvailability(legacy, null)).toBe(true);
    expect(matchesAvailability(legacy, SOLD_OUT_FILTER)).toBe(false);
  });
});

describe("soldOutMatches", () => {
  const catalogue = [available, soldOutWork, { soldOut: true, title: "Delphi Point Winter" }];

  it("finds sold-out works a search would otherwise have surfaced", () => {
    expect(soldOutMatches(catalogue, "delphi")).toHaveLength(2);
  });

  it("is case- and whitespace-insensitive", () => {
    // The five case-sensitivity bugs in this repo were all matching failures.
    expect(soldOutMatches(catalogue, "  DELPHI  ")).toHaveLength(2);
  });

  it("never offers available work as an archive suggestion", () => {
    expect(soldOutMatches(catalogue, "council")).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    // Otherwise an empty category view would claim every sold piece "matches".
    expect(soldOutMatches(catalogue, "")).toEqual([]);
    expect(soldOutMatches(catalogue, "   ")).toEqual([]);
  });
});

describe("availabilitySchema", () => {
  it("marks sold-out work SoldOut", () => {
    expect(availabilitySchema(true)).toBe("https://schema.org/SoldOut");
  });

  it("marks everything else InStock", () => {
    // Including the undefined case — a row from before the column existed.
    expect(availabilitySchema(false)).toBe("https://schema.org/InStock");
    expect(availabilitySchema(undefined)).toBe("https://schema.org/InStock");
  });

  it("only ever emits real schema.org URLs", () => {
    // A typo here doesn't fail anything visibly; it quietly invalidates the
    // structured data, and Google drops the rich result without saying why.
    for (const v of [availabilitySchema(true), availabilitySchema(false)]) {
      expect(v).toMatch(/^https:\/\/schema\.org\/(SoldOut|InStock)$/);
    }
  });
});

describe("excludesSoldOut", () => {
  it.each(["__new__", "__sale__"])("is true for %s, a view about buying", (v) => {
    expect(excludesSoldOut(v)).toBe(true);
  });

  it.each([null, "Bruce Peninsula", SOLD_OUT_FILTER])("is false for %s", (v) => {
    expect(excludesSoldOut(v)).toBe(false);
  });
});

describe("soldOutLast", () => {
  const w = (id: string, soldOut?: boolean) => ({ id, soldOut });

  it("puts every sold-out work after every work for sale", () => {
    const out = soldOutLast([w("a", true), w("b"), w("c", true), w("d")]);
    expect(out.map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("keeps each group in the order the chosen sort left it", () => {
    // Applied after "Price: Low to High", both halves must still read low to
    // high — the partition moves groups, it does not re-sort within them.
    const byPrice = [w("s39", true), w("a79"), w("s89", true), w("a119")];
    expect(soldOutLast(byPrice).map((x) => x.id)).toEqual(["a79", "a119", "s39", "s89"]);
  });

  it("never lets a sold-out work sit between two for sale", () => {
    const out = soldOutLast([w("1"), w("2", true), w("3"), w("4", true), w("5")]);
    const firstSold = out.findIndex((x) => x.soldOut);
    expect(out.slice(firstSold).every((x) => x.soldOut)).toBe(true);
  });

  it("treats a missing flag as for sale", () => {
    const mixed: { id: string; soldOut?: boolean }[] = [w("x", true), { id: "legacy" }];
    expect(soldOutLast(mixed).map((x) => x.id)).toEqual(["legacy", "x"]);
  });

  it("does not mutate what it was given", () => {
    const input = [w("a", true), w("b")];
    soldOutLast(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

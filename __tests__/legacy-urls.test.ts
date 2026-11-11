import { describe, it, expect } from "vitest";
import { resolveLegacySlug, legacyOutcome, type LegacyCandidate } from "../lib/legacy-urls";

/**
 * Old Squarespace URLs (/home/p/<slug>) still get traffic — 642 hits across 24
 * paths in three months, all landing on the 404 page. Some are for work still
 * for sale; most are not.
 *
 * The governing trade: sending someone to the WRONG painting is worse than
 * showing them a 404. Every genuine match in the real traffic scores 1.00,
 * because the old slug was generated from the same title. The best wrong
 * answer scores 0.40. The threshold sits in that gap.
 */

const catalogue: LegacyCandidate[] = [
  { id: "lora-bay", title: "Lora Bay", type: "painting", visible: true },
  { id: "northwinds-beach", title: "Northwinds Beach", type: "painting", visible: true },
  { id: "council-beach", title: "Council Beach", type: "painting", visible: true },
  { id: "inglis-falls", title: "Inglis Falls, Owen Sound", type: "painting", visible: true },
  { id: "bruce-trail", title: "Bruce Trail in the Grey Highlands", type: "painting", visible: true },
  { id: "near-killarney", title: "Near Killarney", type: "painting", visible: true },
  { id: "blue-mountain-sunset-2", title: "Blue Mountain Sunset", type: "photograph", visible: true },
  { id: "alpine-ski-fall-photo", title: "Alpine Ski Club: Fall", type: "photograph", visible: true },
  { id: "beaver-river-access-photo", title: "Beaver River Access Point 2", type: "photograph", visible: true },
  { id: "the-grotto", title: "The Grotto", type: "painting", visible: true },
  { id: "hidden-work", title: "Hidden Work", type: "painting", visible: false },
];

describe("resolveLegacySlug", () => {
  it.each([
    ["lora-bay", "/products/lora-bay"],
    ["northwinds-beach", "/products/northwinds-beach"],
    ["manitoulin-island", null], // not in this fixture catalogue
  ])("matches %s by id", (slug, expected) => {
    expect(resolveLegacySlug(slug, catalogue)).toBe(expected);
  });

  it.each([
    // The old slug was built from the title, so the title is the stronger signal.
    ["blue-mountain-sunset", "/photographs/blue-mountain-sunset-2"],
    ["alpine-ski-club-fall", "/photographs/alpine-ski-fall-photo"],
    ["beaver-river-access-point-2", "/photographs/beaver-river-access-photo"],
    ["bruce-trail-in-the-grey-highlands", "/products/bruce-trail"],
  ])("matches %s by title, where the id alone would not", (slug, expected) => {
    expect(resolveLegacySlug(slug, catalogue)).toBe(expected);
  });

  it("follows a rename only a human could know about", () => {
    // "Spirit Rock" was retitled "Near Killarney" across the catalogue.
    expect(resolveLegacySlug("spirit-rock", catalogue)).toBe("/products/near-killarney");
  });

  describe("refuses to guess", () => {
    it.each([
      // Real traffic, all for work that no longer exists. Best scores 0.00–0.40.
      ["lone-tree"],                       // 448 hits — the biggest, and genuinely gone
      ["lake-huron-shore"],
      ["after-the-storm"],
      ["blue-mountain-in-distance"],       // 0.40 against blue-mountain-sunset-2
      ["nottawasaga-winter"],
      ["ravenna-sunset"],
      ["tobermory"],
      ["algonquin-park-meadow"],
      // Old pottery listings, with Squarespace's duplicate-slug tokens.
      ["milk-dip-cup-92wf6-gc7e4-ctxtn-mk6"],
      ["country-feast-set-3nybt-gnw4d-4jmt8"],
      // A URL that was never real: this shop has never sold aluminium prints.
      ["aluminum-beaver-river-summary"],
    ])("%s keeps its 404 rather than landing on the wrong painting", (slug) => {
      expect(resolveLegacySlug(slug, catalogue)).toBeNull();
    });
  });

  it("never redirects to a hidden work; that would just be a slower 404", () => {
    expect(resolveLegacySlug("hidden-work", catalogue)).toBeNull();
  });

  it("sends photographs to /photographs and paintings to /products", () => {
    expect(resolveLegacySlug("lora-bay", catalogue)).toMatch(/^\/products\//);
    expect(resolveLegacySlug("blue-mountain-sunset", catalogue)).toMatch(/^\/photographs\//);
  });

  it.each([["", null], ["---", null], ["a".repeat(300), null]])(
    "handles junk input (%s)",
    (slug, expected) => {
      expect(resolveLegacySlug(slug, catalogue)).toBe(expected);
    }
  );

  it("resolves nothing against an empty catalogue rather than throwing", () => {
    expect(resolveLegacySlug("lora-bay", [])).toBeNull();
  });
});

describe("legacyOutcome", () => {
  it("redirects a visible work", () => {
    expect(legacyOutcome("lora-bay", catalogue)).toEqual({ kind: "redirect", to: "/products/lora-bay" });
  });

  it("is 404, not 410, for a work that is only hidden, since it may come back", () => {
    expect(legacyOutcome("hidden-work", catalogue)).toEqual({ kind: "hidden" });
  });

  it("is 410 Gone when nothing in the catalogue matches", () => {
    expect(legacyOutcome("lone-tree", catalogue)).toEqual({ kind: "gone" });
    expect(legacyOutcome("aluminum-beaver-river-summary", catalogue)).toEqual({ kind: "gone" });
  });

  it("holds the same match floor for hidden works, so a near miss is still gone", () => {
    expect(legacyOutcome("hidden-meadow", catalogue)).toEqual({ kind: "gone" });
  });
});

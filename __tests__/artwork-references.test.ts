import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");

/**
 * Catalogue images must never be named by path outside the data files.
 *
 * A hardcoded path can't know the work has been hidden. Two of the gift shop's
 * three thumbnails and the site-wide Open Graph image had all gone stale that
 * way — the shop and every shared link were advertising art nobody could buy,
 * and nothing failed to tell us.
 *
 * Anything showing "some artwork" should read the live catalogue instead
 * (lib/showcase.ts).
 */
// Only FIXED paths. A template literal built from the product being rendered —
// `/mockups/${product.id}.jpg` — is correct by construction and not the bug
// this guards against.
const ARTWORK_LITERAL = /["'`]\/(paintings|photographs|mockups)\/(?:(?!\$\{)[^"'`])+\.(jpe?g|png|webp)["'`]/g;

const SEARCH_DIRS = ["app", "components", "lib"];
// The seed files exist precisely to name images by path.
const ALLOWED = new Set(["data/products.ts", "data/photographs.ts", "data/blurs.ts", "data/making-of.ts"]);

function sourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : sourceFiles(rel);
    return /\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

describe("artwork references", () => {
  it("no page or component names a catalogue image by path", () => {
    const offenders: string[] = [];
    for (const rel of SEARCH_DIRS.flatMap(sourceFiles)) {
      if (ALLOWED.has(rel)) continue;
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const m of src.matchAll(ARTWORK_LITERAL)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line}  ${m[0]}`);
      }
    }
    expect(
      offenders,
      `Hardcoded artwork path(s) found. These can't know a work has been hidden — ` +
        `read the live catalogue via lib/showcase.ts instead:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("the gift shop packs carry no thumbnail field", async () => {
    const { giftShopProducts } = await import("../data/giftShop");
    for (const p of giftShopProducts) {
      expect(p, `"${p.id}" must not pin a thumbnail`).not.toHaveProperty("thumbnail");
    }
    expect(giftShopProducts.length).toBeGreaterThan(0);
  });
});

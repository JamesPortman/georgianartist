import { describe, it, expect } from "vitest";
import { products, sizeOptions } from "../data/products";
import { photographs } from "../data/photographs";
import { blurDataURLs } from "../data/blurs";
import { makingOfFilms } from "../data/making-of";
import { siteConfig } from "../data/siteConfig";
import fs from "node:fs";

// Re-export for type checking
const validSizeTypes = Object.keys(sizeOptions);

describe("products data", () => {
  it("has no duplicate IDs", () => {
    const ids = products.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every product has a valid sizeType", () => {
    for (const p of products) {
      expect(validSizeTypes, `"${p.id}" has unknown sizeType "${p.sizeType}"`).toContain(p.sizeType);
    }
  });

  it("every product has a non-empty title, image, and positive price", () => {
    for (const p of products) {
      expect(p.title.trim(), `product "${p.id}" has empty title`).not.toBe("");
      expect(p.image.trim(), `product "${p.id}" has empty image`).not.toBe("");
      expect(p.price, `product "${p.id}" has non-positive price`).toBeGreaterThan(0);
    }
  });

  it("every product ID is URL-safe (lowercase, hyphens only)", () => {
    for (const p of products) {
      expect(p.id, `product "${p.id}" is not URL-safe`).toMatch(/^[a-z0-9-]+$/);
    }
  });

  // Catches the whole class of "renamed/added a painting but not its file"
  // mistakes, which otherwise surface as a broken image on the live site. The
  // files moved from public/ to Blob (catalogue/) in October 2026, so this
  // checks every seed names its copy there, by the same path, offline.
  it("every product image, mockup and inspiration photo is in the Blob catalogue", () => {
    const cat = `${siteConfig.blobStore}/catalogue`;
    for (const p of products) {
      expect(p.image, `image for "${p.id}"`).toMatch(new RegExp(`^${cat}/paintings/[a-z0-9-]+\\.jpg$`));
      expect(p.mockupImage, `mockup for "${p.id}"`).toBe(`${cat}/mockups/${p.id}.jpg`);
      if (p.inspirationImage) {
        expect(p.inspirationImage, `inspiration photo for "${p.id}"`).toMatch(new RegExp(`^${cat}/photographs/`));
      }
    }
    for (const p of photographs) {
      expect(p.image, `image for "${p.id}"`).toMatch(new RegExp(`^${cat}/photographs/[^/]+\\.jpe?g$`, "i"));
    }
  });
});

describe("photographs data", () => {
  it("has no duplicate IDs", () => {
    const ids = photographs.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every photograph has a valid sizeType", () => {
    for (const p of photographs) {
      expect(validSizeTypes, `"${p.id}" has unknown sizeType "${p.sizeType}"`).toContain(p.sizeType);
    }
  });

  it("every photograph has a non-empty title, image, and positive price", () => {
    for (const p of photographs) {
      expect(p.title.trim(), `photo "${p.id}" has empty title`).not.toBe("");
      expect(p.image.trim(), `photo "${p.id}" has empty image`).not.toBe("");
      expect(p.price, `photo "${p.id}" has non-positive price`).toBeGreaterThan(0);
    }
  });

  it("every photograph has positive naturalWidth and naturalHeight", () => {
    for (const p of photographs) {
      expect(p.naturalWidth, `photo "${p.id}" has non-positive naturalWidth`).toBeGreaterThan(0);
      expect(p.naturalHeight, `photo "${p.id}" has non-positive naturalHeight`).toBeGreaterThan(0);
    }
  });

  it("no ID collides with a product ID", () => {
    const productIds = new Set(products.map((p) => p.id));
    for (const p of photographs) {
      expect(productIds.has(p.id), `photo "${p.id}" collides with a product ID`).toBe(false);
    }
  });
});

/**
 * Blur placeholders ship inside the bundle — every one of them, on any page
 * that renders a ProductCard. They are meant to be a few hundred bytes of
 * 10-pixel JPEG.
 *
 * They silently stopped being that. `sips` copies the source file's metadata
 * into the thumbnail it generates, so when the catalogue images gained a
 * copyright notice each placeholder grew from ~860 bytes to ~4400 — a
 * ten-pixel image carrying a full EXIF and XMP rights statement, and
 * data/blurs.ts went from 46KB to 200KB. Nothing failed; the bundle just got
 * four times heavier.
 *
 * scripts/generate-blurs.ts strips metadata now. These guard the result.
 */
describe("blur placeholders", () => {
  const entries = Object.entries(blurDataURLs);
  const bytes = (dataUrl: string) => Buffer.from(dataUrl.split(",")[1]!, "base64");

  it("has one for every seeded catalogue image", () => {
    // Keyed by the image's file name, as when they were generated from the
    // committed files (since moved to Blob). Uploads carry their own blurDataURL.
    const stems = [...products, ...photographs].map((p) =>
      p.image.split("/").pop()!.replace(/\.jpe?g$/i, "")
    );
    for (const stem of new Set(stems)) {
      expect(blurDataURLs[stem], `no blur for ${stem}`).toBeDefined();
    }
  });

  it.each(entries)("%s stays small", (_id, dataUrl) => {
    // A 10px JPEG is under 1KB. Anything near 4KB means metadata crept back in.
    expect(bytes(dataUrl).length).toBeLessThan(2048);
  });

  it("carries no embedded metadata", () => {
    for (const [id, dataUrl] of entries) {
      const b = bytes(dataUrl);
      let at = 2;
      while (at + 4 <= b.length && b[at] === 0xff) {
        const marker = b[at + 1]!;
        if (marker === 0xda) break;
        const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
        expect(isMetadata, `${id} still carries an APP/COM segment`).toBe(false);
        at += 2 + b.readUInt16BE(at + 2);
      }
    }
  });

  it("keeps the whole file small enough to ship in the bundle", () => {
    const total = Buffer.byteLength(fs.readFileSync("data/blurs.ts"));
    expect(total).toBeLessThan(80 * 1024);
  });
});

/**
 * The making-of seed names Blob URLs, and Blob is pruned.
 *
 * Three of these pointed at pre-v2 renders whose blobs had been deleted — the
 * prune was right, the seed was stale. CI then seeded rows referencing 404s,
 * and Next's image optimiser retried them throughout every run:
 *
 *     ⨯ upstream image response failed for …/peasemarsh-poster.jpg 404
 *
 * That stretched a 3-minute E2E run to 8, 9, and once 19 minutes, and a run
 * that slow blows the admin spec's 180s timeout. The "flaky" test everyone
 * kept re-running was being starved by this file.
 *
 * These assertions are offline — a network check would make the suite depend
 * on Blob being up. They catch the shape of the mistake: a seed that has
 * stopped matching the films that actually exist.
 */
describe("making-of seed", () => {
  it("has films", () => {
    expect(makingOfFilms.length).toBeGreaterThan(0);
  });

  it.each(makingOfFilms.map((f) => [f.id, f] as const))(
    "%s names absolute Blob URLs for both video and poster",
    (_id, film) => {
      expect(film.videoUrl).toMatch(/^https:\/\/.+\.blob\.vercel-storage\.com\/making-of\/.+\.mp4$/);
      expect(film.posterUrl).toMatch(/^https:\/\/.+\.blob\.vercel-storage\.com\/making-of\/.+\.(jpg|jpeg)$/);
    }
  );

  it("points every film at a product that exists in the seed", () => {
    const ids = new Set([...products.map((p) => p.id), ...photographs.map((p) => p.id)]);
    for (const f of makingOfFilms) {
      if (f.productId === null) continue;
      expect(ids.has(f.productId), `${f.id} → missing product ${f.productId}`).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    const ids = makingOfFilms.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every film a plausible duration", () => {
    for (const f of makingOfFilms) {
      expect(f.seconds, f.id).toBeGreaterThan(0);
      expect(f.seconds, f.id).toBeLessThan(600);
    }
  });
});

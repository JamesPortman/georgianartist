import { describe, it, expect } from "vitest";
import {
  catalogueBlobPathname,
  isCatalogueBlob,
  isLocalCatalogueImage,
  mockupFor,
  absoluteImageUrl,
} from "../lib/catalogue-images";

/**
 * Blob is the catalogue's one home: the committed files under public/ were
 * copied to catalogue/ and removed in October 2026. Uploads and the catalogue
 * are told apart by path, and a row still naming a removed file stops the deploy.
 */

const HOST = "https://x.public.blob.vercel-storage.com";

describe("catalogue paths", () => {
  it("recognises the committed folders and nothing else", () => {
    expect(isLocalCatalogueImage("/paintings/lora-bay.jpg")).toBe(true);
    expect(isLocalCatalogueImage("/photographs/delphi-point.jpg")).toBe(true);
    expect(isLocalCatalogueImage("/mockups/lora-bay.jpg")).toBe(true);
    expect(isLocalCatalogueImage(`${HOST}/paintings/lora-bay-abc.jpg`)).toBe(false);
    expect(isLocalCatalogueImage("/neutral-room.jpg")).toBe(false);
    expect(isLocalCatalogueImage(null)).toBe(false);
  });

  it("keeps the same path under catalogue/ on Blob", () => {
    expect(catalogueBlobPathname("/paintings/lora-bay.jpg")).toBe("catalogue/paintings/lora-bay.jpg");
    expect(() => catalogueBlobPathname("/neutral-room.jpg")).toThrow();
  });

  it("tells a migrated file from an admin upload", () => {
    expect(isCatalogueBlob(`${HOST}/catalogue/paintings/lora-bay.jpg`)).toBe(true);
    expect(isCatalogueBlob(`${HOST}/paintings/lora-bay-abc.jpg`)).toBe(false);
    expect(isCatalogueBlob("/paintings/lora-bay.jpg")).toBe(false);
    expect(isCatalogueBlob("not a url")).toBe(false);
  });
});

describe("mockupFor", () => {
  it("is the painting's mockup on Blob", () => {
    const mockup = `${HOST}/catalogue/mockups/lora-bay.jpg`;
    expect(mockupFor({ mockupImage: mockup })).toBe(mockup);
  });

  it("is none without one, so the room view is composed in CSS (every admin upload)", () => {
    expect(mockupFor({ mockupImage: null })).toBeNull();
    // No /mockups/<id>.jpg guess from the id: those files are no longer served.
    expect(mockupFor({})).toBeNull();
  });
});

describe("absoluteImageUrl", () => {
  it("leaves a Blob URL alone instead of gluing the site's origin onto it", () => {
    const url = `${HOST}/catalogue/paintings/lora-bay.jpg`;
    expect(absoluteImageUrl(url)).toBe(url);
  });

  it("puts a site path on the site's origin", () => {
    expect(absoluteImageUrl("/paintings/lora-bay.jpg")).toBe("https://www.georgianartist.com/paintings/lora-bay.jpg");
  });
});

describe("the deploy guard for removed image files", () => {
  it("catches a row still naming a committed file, relative or on the site's origin", async () => {
    const { namesRemovedFile } = await import("../scripts/assert-catalogue-on-blob");
    expect(namesRemovedFile("/paintings/lora-bay.jpg")).toBe(true);
    expect(namesRemovedFile("/mockups/lora-bay.jpg")).toBe(true);
    expect(namesRemovedFile("https://www.georgianartist.com/photographs/delphi-point.jpg")).toBe(true);
    expect(namesRemovedFile(`${HOST}/catalogue/paintings/lora-bay.jpg`)).toBe(false);
    expect(namesRemovedFile("/media/homes/x.jpg")).toBe(false);
    expect(namesRemovedFile(null)).toBe(false);
  });
});

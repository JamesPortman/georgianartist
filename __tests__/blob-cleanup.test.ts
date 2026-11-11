import { describe, it, expect, vi, beforeEach } from "vitest";

const del = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  products: [] as {
    id: string;
    image: string;
    inspirationImage: string | null;
    homePhoto?: string | null;
    mockupImage?: string | null;
  }[],
  posts: [] as { imageUrl: string }[],
  films: [] as { videoUrl: string; posterUrl: string | null }[],
}));

vi.mock("@vercel/blob", () => ({ del }));
vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findMany: async () => db.products },
    instagramPost: { findMany: async () => db.posts },
    makingOf: { findMany: async () => db.films },
  },
}));

const { releaseBlob, countReferences, isBlobUrl } = await import("../lib/blob-cleanup");

const BLOB = "https://x.public.blob.vercel-storage.com/inspiration/bruce-trail-abc123.jpg";
const OTHER = "https://x.public.blob.vercel-storage.com/paintings/lora-bay-xyz789.jpg";

const product = (id: string, image = OTHER, inspirationImage: string | null = null) => ({
  id, image, inspirationImage,
});

beforeEach(() => {
  del.mockReset();
  db.products = [];
  db.posts = [];
  db.films = [];
});

/**
 * Two opposite failures meet at the admin's cleanup code.
 *
 * Deleting a product used to leave its inspiration photo in Blob forever —
 * that's where the seven orphans came from. But the obvious fix, deleting both
 * URLs, would have been worse: `bruce-trail-epping` and `bruce-trail-craigleith`
 * shared an inspiration photo, so cleaning up after either one would have taken
 * the image out from under a painting that was live on the site, silently.
 *
 * Hence: delete only what nothing else references, and when in doubt, keep. A
 * leaked blob is swept up by `npm run blobs:prune`; a wrongly deleted one is
 * gone and takes a page with it.
 */
describe("releaseBlob", () => {
  it("deletes a blob nothing else references", async () => {
    db.products = [product("lora-bay")];
    expect(await releaseBlob(BLOB)).toBe("deleted");
    expect(del).toHaveBeenCalledWith(BLOB);
  });

  it("keeps a blob another product shares; the epping/craigleith case", async () => {
    db.products = [product("bruce-trail-epping", OTHER, BLOB)];
    expect(await releaseBlob(BLOB, { excludeProductId: "bruce-trail-craigleith" })).toBe("kept");
    expect(del).not.toHaveBeenCalled();
  });

  it("ignores the product being deleted when counting", async () => {
    // Its own row is the reason the URL is still there; it doesn't count.
    db.products = [product("bruce-trail-craigleith", OTHER, BLOB)];
    expect(await releaseBlob(BLOB, { excludeProductId: "bruce-trail-craigleith" })).toBe("deleted");
  });

  it("keeps a blob a queued Instagram post still needs", async () => {
    db.posts = [{ imageUrl: BLOB }];
    expect(await releaseBlob(BLOB)).toBe("kept");
    expect(del).not.toHaveBeenCalled();
  });

  it("keeps a blob a making-of film still needs", async () => {
    db.films = [{ videoUrl: "https://x/other.mp4", posterUrl: BLOB }];
    expect(await releaseBlob(BLOB)).toBe("kept");
  });

  it("matches URLs ignoring any query string", async () => {
    db.products = [product("lora-bay", OTHER, `${BLOB}?v=2`)];
    expect(await releaseBlob(BLOB)).toBe("kept");
  });

  it("leaves legacy repo paths alone; they aren't blobs", async () => {
    expect(await releaseBlob("/paintings/scenic-caves.jpg")).toBe("not-a-blob");
    expect(del).not.toHaveBeenCalled();
  });

  it("does nothing when there is no URL at all", async () => {
    expect(await releaseBlob(null)).toBe("not-a-blob");
    expect(await releaseBlob(undefined)).toBe("not-a-blob");
    expect(del).not.toHaveBeenCalled();
  });

  it("keeps the blob rather than throwing when the delete fails", async () => {
    // A cleanup failure must never fail the delete the user actually asked for.
    del.mockRejectedValueOnce(new Error("network down"));
    db.products = [product("lora-bay")];
    await expect(releaseBlob(BLOB)).resolves.toBe("kept");
  });
});

describe("countReferences", () => {
  it("counts the same URL held in two places", async () => {
    db.products = [product("a", BLOB), product("b", OTHER, BLOB)];
    expect(await countReferences(BLOB)).toBe(2);
  });

  it("counts zero when only the excluded product holds it", async () => {
    db.products = [product("a", OTHER, BLOB)];
    expect(await countReferences(BLOB, { excludeProductId: "a" })).toBe(0);
  });
});

describe("isBlobUrl", () => {
  it.each([
    [BLOB, true],
    ["/paintings/scenic-caves.jpg", false],
    ["https://www.georgianartist.com/paintings/x.jpg", false],
    ["", false],
  ])("%s → %s", (url, expected) => {
    expect(isBlobUrl(url)).toBe(expected);
  });
});

describe("a collector's home photo", () => {
  const HOME = "https://x.public.blob.vercel-storage.com/homes/lone-pine-q1w2e3.jpg";

  it("counts as a reference, so cleanup never deletes it out from under a page", async () => {
    // Every column that holds a Blob URL has to be counted, or the cleanup
    // treats a live file as litter. This one is someone else's photograph of
    // their own home — it cannot be regenerated, and they would have to be
    // asked for it again.
    db.products = [{ ...product("lone-pine"), homePhoto: HOME }];

    expect(await countReferences(HOME)).toBe(1);
    expect(await releaseBlob(HOME)).toBe("kept");
    expect(del).not.toHaveBeenCalled();
  });

  it("is released once the only painting that shows it lets go", async () => {
    // Replacing the photo on its own painting: that painting is excluded from
    // the count, so the old file really is unreferenced and goes.
    db.products = [{ ...product("lone-pine"), homePhoto: HOME }];

    expect(await releaseBlob(HOME, { excludeProductId: "lone-pine" })).toBe("deleted");
    expect(del).toHaveBeenCalledWith(HOME);
  });
});


describe("the catalogue's own images", () => {
  const CATALOGUE = "https://x.public.blob.vercel-storage.com/catalogue/paintings/lora-bay.jpg";
  const MOCKUP = "https://x.public.blob.vercel-storage.com/catalogue/mockups/lora-bay.jpg";

  it("are never deleted by an edit, even with nothing pointing at them", async () => {
    expect(await releaseBlob(CATALOGUE)).toBe("kept");
    expect(del).not.toHaveBeenCalled();
  });

  it("count a product's mockup as a reference", async () => {
    db.products = [{ ...product("lora-bay"), mockupImage: MOCKUP }];
    expect(await countReferences(MOCKUP)).toBe(1);
  });
});

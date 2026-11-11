import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The gift shop sells cards, postcards and calendars of work that is still
 * available. A sold-out edition has closed, so it stays out of the pack
 * builders' pool and out of the shop's example thumbnails — while remaining in
 * the gallery, and still eligible for the site's share image.
 *
 * The fake database applies the `where` clause itself, so these check what each
 * helper actually returns rather than which arguments it happened to pass.
 */

type Row = { id: string; type: string; visible: boolean; soldOut: boolean; title: string; image: string; blurDataURL: string | null };
const db = vi.hoisted(() => ({ rows: [] as Row[] }));

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        db.rows.filter((r) => Object.entries(where).every(([k, v]) => r[k as keyof Row] === v)),
    },
  },
}));

const { getVisibleArtwork } = await import("../app/gift-shop/gallery");
const { getVisibleWorks } = await import("../lib/showcase");

const row = (id: string, over: Partial<Row> = {}): Row => ({
  id, type: "painting", visible: true, soldOut: false, title: id, image: `/paintings/${id}.jpg`, blurDataURL: null, ...over,
});

beforeEach(() => {
  db.rows = [
    row("lora-bay"),
    row("beaver-river-fall", { soldOut: true }),
    row("manitoulin-island", { visible: false }),
    row("council-beach-photo", { type: "photograph" }),
  ];
});

describe("gift shop pack builders", () => {
  it("offer visible work that is still for sale", async () => {
    const ids = (await getVisibleArtwork()).map((w) => w.id);
    expect(ids).toEqual(["lora-bay", "council-beach-photo"]);
  });

  it("never offer a sold-out work", async () => {
    const ids = (await getVisibleArtwork()).map((w) => w.id);
    expect(ids).not.toContain("beaver-river-fall");
  });
});

describe("getVisibleWorks", () => {
  it("leaves out sold-out work when asked for work for sale (the gift shop thumbnails)", async () => {
    const ids = (await getVisibleWorks(undefined, { forSale: true })).map((w) => w.id);
    expect(ids).toEqual(["lora-bay", "council-beach-photo"]);
  });

  it("still includes it by default (the share image)", async () => {
    // Sold-out work is still on the site; only the shop stops offering it.
    const ids = (await getVisibleWorks("painting")).map((w) => w.id);
    expect(ids).toEqual(["lora-bay", "beaver-river-fall"]);
  });
});

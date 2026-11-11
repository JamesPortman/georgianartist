import { catalogue } from "@/lib/catalogue-cache";

export type GalleryItem = {
  id: string;
  title: string;
  image: string;
  blurDataURL: string | null;
};

/**
 * Visible artwork — paintings and photographs — in the site's display order.
 * This is the pool gift-shop builders (calendar / card / postcard packs) pick from.
 * Paintings come first, then photographs, each in their own sortOrder.
 *
 * Sold-out work is left out. Its edition has closed, and the gift shop sells
 * what is still available; the sold-out pieces live on in the gallery's own
 * section instead.
 */
export async function getVisibleArtwork(): Promise<GalleryItem[]> {
  const rows = await catalogue.product.findMany({
    where: { visible: true, soldOut: false },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    select: { id: true, title: true, image: true, blurDataURL: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    image: r.image,
    blurDataURL: r.blurDataURL ?? null,
  }));
}

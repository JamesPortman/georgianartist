/**
 * Multi-image merchandise — products built from multiple paintings/photos.
 * These live in /gift-shop and need their own builder UIs.
 *
 * Deliberately carries NO thumbnail. Each pack used to name a painting by
 * path, and two of the three had gone stale — they pointed at works that had
 * since been hidden, so the shop was advertising art you could not buy. The
 * landing page now picks a thumbnail from the live catalogue instead, which
 * cannot rot.
 *
 * `showcase` may name a preferred work by id — never by path. It is used only
 * while that work is visible and for sale; otherwise the shop falls back to
 * its automatic pick, so a preference can't go stale the way the paths did.
 */

export type GiftShopProduct = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  priceCAD: number;
  photoCount: number;
  href: string;
  /** Preferred thumbnail, by product id. See above. */
  showcase?: string;
};

export const giftShopProducts: GiftShopProduct[] = [
  {
    id: "calendar",
    title: "Custom Wall Calendar",
    shortTitle: "Custom Calendar",
    description:
      "Pick 12 images for a 12-month wall calendar. They appear in the order you select them.",
    priceCAD: 49,
    photoCount: 12,
    href: "/gift-shop/calendar",
    // Blue Mountain and the escarpment across the bay at golden hour: the most
    // "Georgian Bay" image in the catalogue, for the product that hangs on a
    // wall all year. Chosen 28 Sep 2026.
    showcase: "council-beach",
  },
  {
    id: "card-pack",
    title: "Greeting Card 6-Pack",
    shortTitle: "Card 6-Pack",
    description: "Pick 6 images for a set of 5\"×7\" folded cards. Blank inside.",
    priceCAD: 39,
    photoCount: 6,
    href: "/gift-shop/card-pack",
  },
  {
    id: "postcard-pack",
    title: "Postcard 10-Pack",
    shortTitle: "Postcard 10-Pack",
    description: "Pick 10 images for a set of 4\"×6\" matte postcards.",
    priceCAD: 29,
    photoCount: 10,
    href: "/gift-shop/postcard-pack",
  },
];

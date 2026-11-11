import { siteConfig } from "./siteConfig";

/** Where the catalogue's images live: the public Blob store (lib/catalogue-images.ts). */
const CATALOGUE = `${siteConfig.blobStore}/catalogue`;
export type SizeType =
  | "landscape"
  | "square"
  | "panoramic"
  | "ultrawide"
  | "portrait"
  | "diptych";

export interface SizeOption {
  label: string;
  width: number;
  height: number;
  salePrice: number;
  regularPrice: number;
}

// Size labels are HEIGHT x WIDTH — the CanvasChamp convention James orders in.
// width/height fields stay as they are; only the label reads H x W.
// Every size type offers at least one size, so `sizes[0]` is always a size.
export const sizeOptions: Record<SizeType, [SizeOption, ...SizeOption[]]> = {
  landscape: [
    { label: '12" × 16"', width: 16, height: 12, salePrice: 119, regularPrice: 179 },
    { label: '18" × 24"', width: 24, height: 18, salePrice: 199, regularPrice: 279 },
    { label: '24" × 32"', width: 32, height: 24, salePrice: 299, regularPrice: 399 },
  ],
  square: [
    { label: '8" × 8"',   width: 8,  height: 8,  salePrice: 39,  regularPrice: 59  },
    { label: '12" × 12"', width: 12, height: 12, salePrice: 79,  regularPrice: 119 },
    { label: '16" × 16"', width: 16, height: 16, salePrice: 139, regularPrice: 219 },
    { label: '20" × 20"', width: 20, height: 20, salePrice: 199, regularPrice: 299 },
  ],
  panoramic: [
    { label: '10" × 20"', width: 20, height: 10, salePrice: 89,  regularPrice: 139 },
    { label: '12" × 24"', width: 24, height: 12, salePrice: 129, regularPrice: 199 },
    { label: '20" × 40"', width: 40, height: 20, salePrice: 299, regularPrice: 469 },
  ],
  // Scenic Caves (2.49) and Delphi Point (2.44) are far wider than 2:1. Sold as
  // panoramic they would lose ~20% of their width at the printer, and the width
  // is the subject in both. Ratio 2.5 holds them with a 0-3% crop.
  //
  // Sizes chosen against CanvasChamp.ca cost, not geometry alone: 24x10 and
  // 30x12 look natural but are priced badly there (24x10 costs more than the
  // physically larger 24x12). 40x16 is the outlier in the other direction —
  // C$34 for 640 sq in, the best value per square inch in the catalogue.
  ultrawide: [
    { label: '8" × 20"',  width: 20, height: 8,  salePrice: 89,  regularPrice: 139 },
    { label: '10" × 25"', width: 25, height: 10, salePrice: 139, regularPrice: 219 },
    { label: '16" × 40"', width: 40, height: 16, salePrice: 279, regularPrice: 435 },
  ],
  portrait: [
    { label: '16" × 12"', width: 12, height: 16, salePrice: 119, regularPrice: 179 },
    { label: '24" × 18"', width: 18, height: 24, salePrice: 199, regularPrice: 279 },
  ],
  diptych: [
    { label: '16" × 32" (2 panels)', width: 32, height: 16, salePrice: 279, regularPrice: 440 },
    { label: '20" × 40" (2 panels)', width: 40, height: 20, salePrice: 398, regularPrice: 598 },
  ],
};

export interface Product {
  id: string;
  /** The URL, when it differs from id (renamed); see lib/product-path.ts. */
  slug?: string | null;
  title: string;
  price: number;
  onSale: boolean;
  isNew?: boolean;
  /**
   * The limited edition is exhausted. The work keeps its page and stays in the
   * sitemap, and appears in the galleries after everything for sale, under a
   * "Sold out" heading (lib/availability.ts). Every path to buying it is
   * removed, and it stays out of New and On sale. Not the same as hiding it.
   */
  soldOut?: boolean;
  image: string;
  category: string;
  sizeType: SizeType;
  description?: string;
  /** base64 blur placeholder for uploaded products (seeded ones use data/blurs.ts) */
  blurDataURL?: string;
  /** Optional "inspiration" photo behind a painting + the GPS spot it was taken */
  inspirationImage?: string;
  inspirationLat?: number;
  inspirationLng?: number;
  /** A collector's photo of this work in their home — see schema.prisma. */
  /** The "In a Room" mockup on Blob, once migrated (lib/catalogue-images.ts). */
  mockupImage?: string;
  homePhoto?: string;
  /** How the collector asked to be credited. */
  homePhotoCredit?: string;
}

/**
 * Increment SALE_ROTATION on each site update to rotate which ~25% of paintings
 * display a "Sale" chip. Each rotation value produces a completely different set.
 * Current rotation 1 → on sale: council-beach, alpine-ski-fall, beaver-river-access,
 *                                algonquin-park, spirit-rock
 */
export const SALE_ROTATION = 1;

function hashOnSale(id: string, rotation: number): boolean {
  let h = rotation * 2654435761;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 2654435761);
  }
  return (h >>> 0) % 4 === 0;
}

type RawProduct = Omit<Product, "onSale">;

/**
 * Whose works the arrays in this file and `data/photographs.ts` are.
 *
 * Checked against `siteConfig.artist` by `prisma/seed.ts`, which refuses to
 * run when they disagree. That combination — a fork's identity with this
 * catalogue still in place — means someone is about to publish another
 * artist's paintings under their own name, which is a copyright problem
 * rather than an untidy one, and it would happen silently.
 */
export const SEED_CATALOGUE_OWNER = "James Portman";

// ─────────────────────────────────────────────────────────────────────────────
// SEED DATA ONLY. The live site reads products from the database (see lib/db.ts
// and the admin at /admin/products). Editing this array does NOT change the
// site — it only affects a fresh `npm run db:seed`. Add/edit/remove products
// through the admin UI instead. `sizeOptions` and the types above ARE used live.
// ─────────────────────────────────────────────────────────────────────────────
const rawProducts: RawProduct[] = [
  {
    id: "council-beach",
    title: "Council Beach",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/paintings/council-beach.jpg`,
    mockupImage: `${CATALOGUE}/mockups/council-beach.jpg`,
    category: "Georgian Bay",
    sizeType: "panoramic",
    description: "The icy shores of Council Beach at the edge of Georgian Bay, where winter transforms the landscape into a serene blue and white expanse.",
    inspirationLat: 44.540863,
    inspirationLng: -80.407364,
  },
  {
    id: "lora-bay",
    title: "Lora Bay",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/lora-bay.jpg`,
    mockupImage: `${CATALOGUE}/mockups/lora-bay.jpg`,
    category: "Georgian Bay",
    sizeType: "landscape",
    description: "The calm, sheltered waters of Lora Bay near Thornbury, edged by the rugged Georgian Bay shoreline.",
    inspirationLat: 44.590041,
    inspirationLng: -80.497257,
  },
  {
    id: "inglis-falls",
    title: "Inglis Falls, Owen Sound",
    price: 39,
    image: `${CATALOGUE}/paintings/inglis-falls.jpg`,
    mockupImage: `${CATALOGUE}/mockups/inglis-falls.jpg`,
    category: "Owen Sound",
    sizeType: "square",
    description: "A 60-foot cascade created by the Sydenham River meeting the edge of the Niagara Escarpment near Owen Sound, Ontario.",
    inspirationLat: 44.5264,
    inspirationLng: -80.9341,
  },
  {
    id: "manitoulin-island",
    title: "Manitoulin Island",
    price: 119,
    image: `${CATALOGUE}/paintings/manitoulin-island.jpg`,
    mockupImage: `${CATALOGUE}/mockups/manitoulin-island.jpg`,
    category: "Manitoulin",
    sizeType: "landscape",
    description: "The vast, windswept expanse of Manitoulin Island, the world's largest freshwater island, rich with autumn colour.",
  },
  {
    id: "bruce-trail",
    title: "Bruce Trail in the Grey Highlands",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/bruce-trail.jpg`,
    mockupImage: `${CATALOGUE}/mockups/bruce-trail.jpg`,
    category: "Grey Highlands",
    sizeType: "portrait",
    description: "The iconic Bruce Trail winds through the Grey Highlands, where towering trees and rugged escarpment define Ontario's most beloved hiking route.",
    inspirationLat: 44.380469,
    inspirationLng: -80.554353,
  },
  {
    id: "alpine-ski-fall",
    title: "Alpine Ski Club: Fall",
    price: 119,
    image: `${CATALOGUE}/paintings/alpine-ski-fall.jpg`,
    mockupImage: `${CATALOGUE}/mockups/alpine-ski-fall.jpg`,
    category: "Blue Mountain",
    sizeType: "landscape",
    description: "The slopes of the Alpine Ski Club on Blue Mountain, ablaze with autumn colour before the season's first snowfall.",
    inspirationLat: 44.521606,
    inspirationLng: -80.352364,
  },
  {
    id: "beaver-river-access",
    title: "Beaver River: Access Point 2",
    price: 119,
    image: `${CATALOGUE}/paintings/beaver-river-access.jpg`,
    mockupImage: `${CATALOGUE}/mockups/beaver-river-access.jpg`,
    category: "Beaver River",
    sizeType: "landscape",
    description: "A quiet access point on the Beaver River in the Beaver Valley, its still water mirroring the surrounding forest.",
    inspirationLat: 44.429264,
    inspirationLng: -80.533164,
  },

  // ── 2026 repaints: new painted versions of works already photographed,
  // plus three scenes new to the catalogue. The photographs they came from
  // are unchanged and still sold separately.
  {
    id: "blue-mountain-sunrise-painting",
    title: "Blue Mountain Sunrise",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/blue-mountain-sunrise-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/blue-mountain-sunrise-painting.jpg`,
    category: "Blue Mountain",
    sizeType: "landscape",
    description:
      "A winter sunrise breaks in pink, violet and gold over the snow-covered rooftops and silhouetted evergreens below Blue Mountain.",
    inspirationImage: `${CATALOGUE}/photographs/blue-mountain-sunrise.jpg`,
    inspirationLat: 44.5284515,
    inspirationLng: -80.3574756,
  },
  {
    id: "blue-mountain-sunset-painting",
    title: "Blue Mountain Sunset",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/blue-mountain-sunset-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/blue-mountain-sunset-painting.jpg`,
    category: "Blue Mountain",
    sizeType: "landscape",
    description:
      "Rippling banks of cloud catch the last coral and amber light of the day above Blue Mountain.",
    inspirationImage: `${CATALOGUE}/photographs/blue-mountain-sunset-2.jpg`,
    inspirationLat: 44.529469,
    inspirationLng: -80.356239,
  },
  {
    id: "blue-mountain-trail-painting",
    title: "Blue Mountain Trail",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/paintings/blue-mountain-trail-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/blue-mountain-trail-painting.jpg`,
    category: "Blue Mountain",
    sizeType: "panoramic",
    description:
      "Slender trunks rise through a hardwood forest turning gold near the Alpine Ski Club, the trail floor deep in fallen leaves.",
    inspirationImage: `${CATALOGUE}/photographs/blue-mountain-trail.jpg`,
    inspirationLat: 44.51616,
    inspirationLng: -80.346434,
  },
  {
    id: "bridal-veil-falls-painting",
    title: "Bridal Veil Falls",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/bridal-veil-falls-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/bridal-veil-falls-painting.jpg`,
    category: "Manitoulin",
    sizeType: "landscape",
    description:
      "Bridal Veil Falls spills in a wide curtain over the layered limestone of the escarpment at Kagawong on Manitoulin Island.",
    inspirationImage: `${CATALOGUE}/photographs/bridal-veil-falls.jpg`,
    inspirationLat: 45.9010259,
    inspirationLng: -82.2551178,
  },
  {
    id: "local-farm-painting",
    title: "Local Farm",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/local-farm-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/local-farm-painting.jpg`,
    category: "Blue Mountain",
    sizeType: "landscape",
    description:
      "Sunflowers crowd a weathered fence line in high summer, a grey barn and grain silo standing behind them in the Blue Mountains.",
    inspirationImage: `${CATALOGUE}/photographs/local-farm.jpg`,
    inspirationLat: 44.555687,
    inspirationLng: -80.472485,
  },
  {
    id: "the-grotto-painting",
    title: "The Grotto",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/paintings/the-grotto-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/the-grotto-painting.jpg`,
    category: "Bruce Peninsula",
    sizeType: "panoramic",
    description:
      "Turquoise water against the limestone cliffs of the Grotto, where Georgian Bay meets the Niagara Escarpment near Tobermory.",
    inspirationImage: `${CATALOGUE}/photographs/the-grotto.jpg`,
    inspirationLat: 45.2452292,
    inspirationLng: -81.524182,
  },
  {
    id: "top-of-blue-mountain",
    title: "Top of Blue Mountain",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/paintings/top-of-blue-mountain.jpg`,
    mockupImage: `${CATALOGUE}/mockups/top-of-blue-mountain.jpg`,
    category: "Blue Mountain",
    sizeType: "panoramic",
    description:
      "Autumn sun breaks through a blazing maple canopy at the top of Blue Mountain, bare branches reaching into a clear sky.",
    inspirationImage: `${CATALOGUE}/photographs/autumn-canopy.jpg`,
    inspirationLat: 44.517044,
    inspirationLng: -80.345527,
  },
  {
    id: "delphi-point-painting",
    title: "Delphi Point",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/paintings/delphi-point-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/delphi-point-painting.jpg`,
    category: "Georgian Bay",
    sizeType: "ultrawide",
    description:
      "The flat limestone shelf of Delphi Point runs out into Georgian Bay, autumn colour banked along the shoreline behind.",
    inspirationImage: `${CATALOGUE}/photographs/Delphi_Point.jpg`,
    inspirationLat: 44.548782,
    inspirationLng: -80.422663,
  },
  {
    id: "ravenna-canola-painting",
    title: "Ravenna Canola",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/ravenna-canola-painting.jpg`,
    mockupImage: `${CATALOGUE}/mockups/ravenna-canola-painting.jpg`,
    category: "Grey Highlands",
    sizeType: "landscape",
    description:
      "A canola field in full bloom near Ravenna, yellow running to the edge of the Grey Highlands under an open sky.",
    inspirationImage: `${CATALOGUE}/photographs/Ravenna_Canola.jpg`,
    inspirationLat: 44.459745,
    inspirationLng: -80.429869,
  },
  {
    id: "bruce-trail-epping",
    title: "Bruce Trail at Epping",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/bruce-trail-epping.jpg`,
    mockupImage: `${CATALOGUE}/mockups/bruce-trail-epping.jpg`,
    category: "Georgian Bay",
    sizeType: "landscape",
    description:
      "Fresh snow weighs down the hemlocks along the Bruce Trail at Epping, deep blue shadows running across the drifts.",
    inspirationLat: 44.46,
    inspirationLng: -80.55,
  },
  {
    id: "peasemarsh",
    title: "Peasemarsh",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/peasemarsh.jpg`,
    mockupImage: `${CATALOGUE}/mockups/peasemarsh.jpg`,
    category: "Georgian Bay",
    sizeType: "landscape",
    description:
      "Autumn on the Georgian Bay shoreline near Craigleith, gold and rust along the treeline with the season's first snow already down on the gravel.",
    inspirationLat: 44.538619,
    inspirationLng: -80.368317,
  },
  {
    id: "near-killarney",
    title: "Near Killarney",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/near-killarney.jpg`,
    mockupImage: `${CATALOGUE}/mockups/near-killarney.jpg`,
    category: "Killarney",
    sizeType: "landscape",
    description:
      "A sheltered inlet on the Georgian Bay shore near Killarney, granite running down to water still enough to hold the whole treeline.",
    inspirationImage: `${CATALOGUE}/photographs/near-killarney-photo.jpg`,
    inspirationLat: 46.1164333,
    inspirationLng: -81.7329722,
  },
  {
    id: "scenic-caves",
    title: "Scenic Caves",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/paintings/scenic-caves.jpg`,
    mockupImage: `${CATALOGUE}/mockups/scenic-caves.jpg`,
    category: "Blue Mountain",
    sizeType: "ultrawide",
    description:
      "Low winter sun throws long blue shadows across the groomed trails through bare hardwoods at Scenic Caves.",
    inspirationImage: `${CATALOGUE}/photographs/scenic-caves-photo.jpg`,
    inspirationLat: 44.47547,
    inspirationLng: -80.31849,
  },
  {
    id: "singhampton",
    title: "Singhampton",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/singhampton.jpg`,
    mockupImage: `${CATALOGUE}/mockups/singhampton.jpg`,
    category: "Blue Mountain",
    sizeType: "landscape",
    description:
      "A stand of spruce bends under fresh snow near Singhampton, the field in front of them swept smooth and empty.",
    inspirationImage: `${CATALOGUE}/photographs/singhampton-photo.jpg`,
    inspirationLat: 44.49214,
    inspirationLng: -80.35319,
  },
  {
    id: "northwinds-beach",
    title: "Northwinds Beach",
    price: 119,
    isNew: true,
    image: `${CATALOGUE}/paintings/northwinds-beach.jpg`,
    mockupImage: `${CATALOGUE}/mockups/northwinds-beach.jpg`,
    category: "Georgian Bay",
    sizeType: "landscape",
    description:
      "A wave breaks along the wet sand at Northwinds Beach, the sky going pink and lavender over the far shore as the light drops.",
    inspirationImage: `${CATALOGUE}/photographs/northwinds-beach.jpg`,
    inspirationLat: 44.527122,
    inspirationLng: -80.327408,
  },
];

export const products: Product[] = rawProducts.map((p) => ({
  ...p,
  onSale: hashOnSale(p.id, SALE_ROTATION),
}));

export const categories = Array.from(new Set(products.map((p) => p.category))).sort();

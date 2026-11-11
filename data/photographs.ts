import { SizeType } from "@/data/products";
import { siteConfig } from "./siteConfig";

/** Where the catalogue's images live: the public Blob store (lib/catalogue-images.ts). */
const CATALOGUE = `${siteConfig.blobStore}/catalogue`;

export interface Photograph {
  id: string;
  /** The URL, when it differs from id (renamed); see lib/product-path.ts. */
  slug?: string | null;
  title: string;
  price: number;
  onSale?: boolean;
  isNew?: boolean;
  /** The limited edition is exhausted — see Product.soldOut. */
  soldOut?: boolean;
  image: string;
  naturalWidth: number;
  naturalHeight: number;
  category: string;
  sizeType: SizeType;
  description?: string;
  /** base64 blur placeholder for uploaded products (seeded ones use data/blurs.ts) */
  blurDataURL?: string;
  /** Where the photo was taken — usually auto-filled from the photo's EXIF GPS. */
  lat?: number;
  lng?: number;
}

// SEED DATA ONLY — the live site reads photographs from the database (admin at
// /admin/products). Editing this array only affects a fresh `npm run db:seed`.
export const photographs: Photograph[] = [
  {
    id: "ravenna-canola-photo",
    title: "Ravenna Canola",
    price: 99,
    image: `${CATALOGUE}/photographs/Ravenna_Canola.jpg`,
    naturalWidth: 3173,
    naturalHeight: 2332,
    category: "Grey Highlands",
    sizeType: "landscape",
    description: "A sweeping canola field near Ravenna rolls over the hills of Grey Highlands beneath a clear blue sky.",
    lat: 44.459745,
    lng: -80.429869,
  },
  {
    id: "northwinds-beach-twilight",
    title: "Northwinds Beach Twilight",
    price: 99,
    image: `${CATALOGUE}/photographs/northwinds-beach-twilight.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1469,
    category: "Georgian Bay",
    sizeType: "landscape",
    description: "The rocky shoreline of Northwinds Beach at twilight, where the open water of Georgian Bay settles into evening calm.",
    lat: 44.5268526,
    lng: -80.3272174,
  },
  {
    id: "the-grotto",
    title: "The Grotto",
    price: 89,
    image: `${CATALOGUE}/photographs/the-grotto.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1200,
    category: "Bruce Peninsula",
    sizeType: "panoramic",
    description: "The brilliant turquoise water and rugged limestone cliffs of the Grotto on the Bruce Peninsula, where Georgian Bay meets the towering Niagara Escarpment near Tobermory.",
    lat: 45.2452292,
    lng: -81.524182,
  },
  {
    id: "blue-mountain-sunrise",
    title: "Blue Mountain Sunrise",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/blue-mountain-sunrise.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Blue Mountain",
    sizeType: "landscape",
    description: "A blazing winter sunrise sets the sky alight in pink, violet, and gold above the snow-dusted rooftops and silhouetted evergreens of the Blue Mountains.",
    lat: 44.5284515,
    lng: -80.3574756,
  },
  {
    id: "blue-mountain-sunset-2",
    title: "Blue Mountain Sunset",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/blue-mountain-sunset-2.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Blue Mountain",
    sizeType: "landscape",
    description: "Rippling waves of cloud catch the last of the sunset, glowing coral and amber against a fading blue sky.",
    lat: 44.529469,
    lng: -80.356239,
  },
  {
    id: "local-farm",
    title: "Local Farm",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/local-farm.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Simcoe County",
    sizeType: "landscape",
    description: "A row of sunflowers turns to the morning light along a weathered fence line, a grey barn and grain silo beyond, high summer in Simcoe County.",
    lat: 44.409721,
    lng: -79.815761,
  },
  {
    id: "blue-mountain-trail",
    title: "Blue Mountain Trail",
    price: 89,
    image: `${CATALOGUE}/photographs/blue-mountain-trail.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1200,
    category: "Blue Mountain",
    sizeType: "panoramic",
    description: "Slender trunks rise through a hardwood forest turning gold and amber on Blue Mountain near the Alpine Ski Club, the floor deep with fallen autumn leaves.",
    lat: 44.51616,
    lng: -80.346434,
  },
  {
    id: "bridal-veil-falls",
    title: "Bridal Veil Falls",
    price: 99,
    image: `${CATALOGUE}/photographs/bridal-veil-falls.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Manitoulin",
    sizeType: "landscape",
    description: "Bridal Veil Falls spills in a wide curtain over the layered limestone of the Niagara Escarpment at Kagawong on Manitoulin Island.",
    lat: 45.9010259,
    lng: -82.2551178,
  },
  {
    id: "autumn-canopy",
    title: "Autumn Canopy",
    price: 89,
    image: `${CATALOGUE}/photographs/autumn-canopy.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1200,
    category: "Blue Mountain",
    sizeType: "panoramic",
    description: "Autumn sun breaks through a blazing maple canopy of gold and orange at the top of Blue Mountain, bare branches reaching into a clear blue sky.",
    lat: 44.517044,
    lng: -80.345527,
  },
  {
    id: "snowy-owl-in-craigleith",
    title: "Snowy Owl in Craigleith",
    price: 99,
    image: `${CATALOGUE}/photographs/snowy-owl-in-craigleith.jpg`,
    naturalWidth: 1800,
    naturalHeight: 2400,
    category: "Georgian Bay",
    sizeType: "portrait",
    description: "A snowy owl keeps watch from an ice-streaked boulder along the winter shoreline at Craigleith Provincial Park, the cold blue of Georgian Bay stretching out behind.",
    lat: 44.5364194,
    lng: -80.3492206,
  },
  {
    id: "top-of-blue-mountain-photo",
    title: "Top of Blue Mountain",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/photographs/top-of-blue-mountain-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1200,
    category: "Blue Mountain",
    sizeType: "panoramic",
    description:
      "Late autumn sun flares through a canopy of gold and copper maple at the top of Blue Mountain, pale birch trunks rising into the branches.",
    lat: 44.517044,
    lng: -80.345527,
  },
  {
    id: "alpine-ski-fall-photo",
    title: "Alpine Ski Club: Fall",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/alpine-ski-fall-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Blue Mountain",
    sizeType: "landscape",
    description:
      "A gravel track winds up between hardwoods turning scarlet and orange on the slopes above the Alpine Ski Club, under a heavy October sky.",
    lat: 44.52161,
    lng: -80.35236,
  },
  {
    id: "beaver-river-access-photo",
    title: "Beaver River: Access Point 2",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/beaver-river-access-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Beaver River",
    sizeType: "landscape",
    description:
      "Lily pads crowd the still water at the Beaver River access, bare trunks standing out of the marsh grass under a clear late-summer sky.",
    lat: 44.42926,
    lng: -80.53316,
  },
  {
    id: "council-beach-photo",
    title: "Council Beach",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/photographs/council-beach-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1161,
    category: "Georgian Bay",
    sizeType: "panoramic",
    description:
      "Plates of shore ice reach out toward open water at Council Beach, the snow-streaked face of the escarpment closing the far end of the bay.",
    lat: 44.540863,
    lng: -80.407364,
  },
  {
    id: "lora-bay-photo",
    title: "Lora Bay",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/lora-bay-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Georgian Bay",
    sizeType: "landscape",
    description:
      "Winter turns the water at Lora Bay a hard, brilliant blue, breaking against a snow-covered spit with the escarpment low on the horizon.",
    lat: 44.590041,
    lng: -80.497257,
  },
  {
    id: "bruce-trail-photo",
    title: "Bruce Trail in the Grey Highlands",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/bruce-trail-photo.jpg`,
    naturalWidth: 1800,
    naturalHeight: 2400,
    category: "Grey Highlands",
    sizeType: "portrait",
    description:
      "A stream drops through moss-covered boulders in the summer woods along the Bruce Trail in the Grey Highlands.",
    lat: 44.38047,
    lng: -80.55435,
  },
  {
    id: "manitoulin-island-photo",
    title: "Manitoulin Island",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/manitoulin-island-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Manitoulin",
    sizeType: "landscape",
    description:
      "A high view across the treetops of Manitoulin Island to the North Channel, low islands and the blue hills of the mainland beyond.",
    lat: 45.95514,
    lng: -81.9438,
  },
  {
    id: "near-killarney-photo",
    title: "Near Killarney",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/near-killarney-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Killarney",
    sizeType: "landscape",
    description:
      "White pine crowd a low granite point near Killarney, the shallows so still they carry the whole treeline back across the water.",
    lat: 46.1164333,
    lng: -81.7329722,
  },
  {
    id: "delphi-point",
    title: "Delphi Point",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/photographs/Delphi_Point.jpg`,
    naturalWidth: 2400,
    naturalHeight: 984,
    category: "Blue Mountain",
    sizeType: "panoramic",
    description:
      "Flat limestone shelves run out into the waves at Delphi Point, cedar and turning maple along the shore under a broken autumn sky.",
    lat: 44.548782,
    lng: -80.422663,
  },
  {
    id: "inglis-falls-photo",
    title: "Inglis Falls, Owen Sound",
    price: 39,
    isNew: true,
    image: `${CATALOGUE}/photographs/inglis-falls-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 2400,
    category: "Owen Sound",
    sizeType: "square",
    description:
      "Inglis Falls spreads down a wide staircase of limestone where the Sydenham River drops off the escarpment south of Owen Sound.",
    lat: 44.525216,
    lng: -80.935551,
  },
  {
    id: "scenic-caves-photo",
    title: "Scenic Caves",
    price: 89,
    isNew: true,
    image: `${CATALOGUE}/photographs/scenic-caves-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 963,
    category: "Blue Mountain",
    sizeType: "panoramic",
    description:
      "Low winter sun throws long blue shadows across the groomed trails through bare hardwoods at Scenic Caves.",
    lat: 44.47547,
    lng: -80.31849,
  },
  {
    id: "singhampton-photo",
    title: "Singhampton",
    price: 99,
    isNew: true,
    image: `${CATALOGUE}/photographs/singhampton-photo.jpg`,
    naturalWidth: 2400,
    naturalHeight: 1800,
    category: "Blue Mountain",
    sizeType: "landscape",
    description:
      "A stand of spruce bends under fresh snow near Singhampton, the field in front of them swept smooth and empty.",
    lat: 44.49214,
    lng: -80.35319,
  },
];

export const photographCategories = Array.from(
  new Set(photographs.map((p) => p.category))
).sort();

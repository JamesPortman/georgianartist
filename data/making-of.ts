export interface MakingOfSeed {
  id: string;
  title: string;
  /** Blob URL — the films are 10–15MB each, too large to commit like the images. */
  videoUrl: string;
  /** The film's last frame: the finished work. */
  posterUrl: string;
  description: string;
  /** Product.id when the work is in the catalogue; null while it isn't. */
  productId: string | null;
  seconds: number;
}

const blob = "https://f1wvbcnefdducxwm.public.blob.vercel-storage.com/making-of";

// The films themselves sit one level down, under faststart/. They were remuxed
// with `-movflags +faststart` (a stream copy — the pixels are untouched) so the
// moov atom sits at the front of the file instead of the end. With it at the
// end, a player that wants the duration has to read to the end of a 10–30MB
// file first, which is how a 444MB Blob store billed 9.11GB of transfer in a
// month. New path rather than an overwrite on purpose: these are served with
// `max-age=2592000`, so reusing the old URLs would have left the CDN handing
// out the old layout for another month.
const films = `${blob}/faststart`;

// SEED DATA ONLY — the live site reads these from the database. Editing this
// array only affects a fresh `npm run db:seed`.
//
// Generated from production and URL-checked: every video and poster below
// returned 200 when this was written. That matters more than it sounds.
//
// This file held three films pointing at pre-v2 renders. Those originals were
// re-rendered, which left the old blobs unreferenced, and prune-orphan-blobs
// deleted them — correctly. But the seed still named them, so CI seeded rows
// pointing at 404s and Next's image optimiser retried each one throughout the
// run:
//
//     ⨯ upstream image response failed for …/peasemarsh-poster.jpg 404
//
// That turned a 3-minute E2E run into 8, 9, and once 19 minutes, and a slow
// enough run blows the admin spec's 180s budget. The flaky test everyone was
// re-running was being starved by this file.
//
// So: when a film is re-rendered, update it here in the same PR — and if you
// change these URLs, check they resolve.
//
// It happened again on 29 Sep 2026, to delphi-point and scenic-caves (the v3
// renders had replaced them in production, not here). The pruner scanned this
// file as text and could not see the URLs the template below builds; it now
// evaluates the seeds, so it will keep a file this array still names.
export const makingOfFilms: MakingOfSeed[] = [
  {
    id: "alpine-ski-fall",
    title: "Alpine Ski Club: Fall",
    videoUrl: `${films}/alpine-ski-fall.mp4`,
    posterUrl: `${blob}/alpine-ski-fall-poster.jpg`,
    description:
      "The slopes of the Alpine Ski Club before the first snow, the autumn trees blocked in first and the path and the sky opened up after them.",
    productId: "alpine-ski-fall",
    seconds: 56,
  },
  {
    id: "beaver-river-access",
    title: "Beaver River Access",
    videoUrl: `${films}/beaver-river-access.mp4`,
    posterUrl: `${blob}/beaver-river-access-poster.jpg`,
    description:
      "The lily pads and reeds at the Beaver River access point, the water laid in first and the pads floated on last.",
    productId: "beaver-river-access",
    seconds: 56,
  },
  {
    id: "blue-mountain-sunrise",
    title: "Blue Mountain Sunrise",
    videoUrl: `${films}/blue-mountain-sunrise.mp4`,
    posterUrl: `${blob}/blue-mountain-sunrise-poster.jpg`,
    description:
      "A winter sunrise over the Blue Mountains, the sky worked from the darks upward into pink and gold.",
    productId: "blue-mountain-sunrise-painting",
    seconds: 56,
  },
  {
    id: "blue-mountain-sunset",
    title: "Blue Mountain Sunset",
    videoUrl: `${films}/blue-mountain-sunset.mp4`,
    posterUrl: `${blob}/blue-mountain-sunset-poster.jpg`,
    description:
      "A bank of altocumulus catching the last light over Blue Mountain, worked from the orange cloud bank down into the pale sky beneath it.",
    productId: "blue-mountain-sunset-painting",
    seconds: 56,
  },
  {
    id: "blue-mountain-trail",
    title: "Blue Mountain Trail",
    videoUrl: `${films}/blue-mountain-trail.mp4`,
    posterUrl: `${blob}/blue-mountain-trail-poster.jpg`,
    description:
      "A hardwood trail near the Alpine Ski Club turning gold: the trunks massed in first, the leaf litter and the path itself left until last.",
    productId: "blue-mountain-trail-painting",
    seconds: 56,
  },
  {
    id: "bridal-veil-falls",
    title: "Bridal Veil Falls",
    videoUrl: `${films}/bridal-veil-falls.mp4`,
    posterUrl: `${blob}/bridal-veil-falls-poster.jpg`,
    description:
      "The wide curtain of Bridal Veil Falls at Kagawong, laid in from the dark limestone behind and finished with the falling water.",
    productId: "bridal-veil-falls-painting",
    seconds: 56,
  },
  {
    id: "bruce-trail-epping",
    title: "Bruce Trail at Epping",
    videoUrl: `${films}/bruce-trail-epping.mp4`,
    posterUrl: `${blob}/bruce-trail-epping-poster.jpg`,
    description:
      "Deep snow on the conifers along the Bruce Trail at Epping, the dark trunks set against the sky before the snow is heaped on.",
    productId: "bruce-trail-epping",
    seconds: 56,
  },
  {
    id: "bruce-trail-grey-highlands",
    title: "Bruce Trail in the Grey Highlands",
    videoUrl: `${films}/bruce-trail-grey-highlands.mp4`,
    posterUrl: `${blob}/bruce-trail-grey-highlands-poster.jpg`,
    description:
      "A cascade over moss-covered boulders in the Grey Highlands, the rocks massed in before the white water runs over them.",
    productId: "bruce-trail",
    seconds: 56,
  },
  {
    id: "council-beach",
    title: "Council Beach",
    videoUrl: `${films}/council-beach.mp4`,
    posterUrl: `${blob}/council-beach-poster.jpg`,
    description:
      "Winter light at Council Beach: the escarpment and treeline blocked in first, then the broken ice worked up under a low sun.",
    productId: "council-beach",
    seconds: 56,
  },
  {
    id: "delphi-point",
    title: "Delphi Point",
    videoUrl: `${films}/delphi-point-v3.mp4`,
    posterUrl: `${blob}/delphi-point-v3-poster.jpg`,
    description:
      "Limestone shelves running out into the waves at Delphi Point, the broken autumn sky worked up from the darks.",
    productId: "delphi-point-painting",
    seconds: 56,
  },
  {
    id: "inglis-falls",
    title: "Inglis Falls, Owen Sound",
    videoUrl: `${films}/inglis-falls.mp4`,
    posterUrl: `${blob}/inglis-falls-poster.jpg`,
    description:
      "The Sydenham River dropping off the escarpment south of Owen Sound: the rock staircase blocked in first, the white water last.",
    productId: "inglis-falls",
    seconds: 56,
  },
  {
    id: "local-farm-sunflowers",
    title: "Local Farm",
    videoUrl: `${films}/local-farm-sunflowers-v2.mp4`,
    posterUrl: `${blob}/local-farm-sunflowers-v2-poster.jpg`,
    description:
      "The sunflower fence line in Simcoe County, painted from the photograph: the barn and the field blocked in first, then the sky, and the flower heads last.",
    productId: "local-farm-painting",
    seconds: 56,
  },
  {
    id: "lora-bay",
    title: "Lora Bay",
    videoUrl: `${films}/lora-bay.mp4`,
    posterUrl: `${blob}/lora-bay-poster.jpg`,
    description:
      "Winter light on the hard blue water at Lora Bay, the open water laid in first, the escarpment behind it next, and the snow-covered spit after both.",
    productId: "lora-bay",
    seconds: 56,
  },
  {
    id: "manitoulin-island",
    title: "Manitoulin Island",
    videoUrl: `${films}/manitoulin-island-v2.mp4`,
    posterUrl: `${blob}/manitoulin-island-v2-poster.jpg`,
    description:
      "The long view over the North Channel from the Manitoulin escarpment, the green foreground laid in first, the water and the far hills brought up behind it.",
    productId: "manitoulin-island",
    seconds: 56,
  },
  {
    id: "near-killarney",
    title: "Near Killarney",
    videoUrl: `${films}/near-killarney.mp4`,
    posterUrl: `${blob}/near-killarney-poster.jpg`,
    description:
      "A granite point on the Killarney shore, the pines massed in before the still water takes their reflection.",
    productId: "near-killarney",
    seconds: 56,
  },
  {
    id: "northwinds-beach",
    title: "Northwinds Beach",
    videoUrl: `${films}/northwinds-beach.mp4`,
    posterUrl: `${blob}/northwinds-beach-poster.jpg`,
    description:
      "A wave breaking on the wet sand at Northwinds Beach at dusk: the whole scene washed in pale first, the dark water worked over it, and the foam left until last.",
    productId: "northwinds-beach",
    seconds: 56,
  },
  {
    id: "peasemarsh",
    title: "Peasemarsh",
    videoUrl: `${films}/peasemarsh-v2.mp4`,
    posterUrl: `${blob}/peasemarsh-v2-poster.jpg`,
    description:
      "Autumn on the Georgian Bay shoreline near Craigleith, the first snow already down on the gravel.",
    productId: "peasemarsh",
    seconds: 56,
  },
  {
    id: "ravenna-canola",
    title: "Ravenna Canola",
    videoUrl: `${films}/ravenna-canola.mp4`,
    posterUrl: `${blob}/ravenna-canola-poster.jpg`,
    description:
      "A canola field rolling over the Grey Highlands, the field blocked in dark green first and the yellow laid on over it.",
    productId: "ravenna-canola-painting",
    seconds: 56,
  },
  {
    id: "scenic-caves",
    title: "Scenic Caves",
    videoUrl: `${films}/scenic-caves-v3.mp4`,
    posterUrl: `${blob}/scenic-caves-v3-poster.jpg`,
    description:
      "Low winter sun across the groomed trails at Scenic Caves: the bare hardwoods massed in first and the long blue shadows laid across the snow straight after.",
    productId: "scenic-caves",
    seconds: 56,
  },
  {
    id: "singhampton",
    title: "Singhampton",
    videoUrl: `${films}/singhampton.mp4`,
    posterUrl: `${blob}/singhampton-poster.jpg`,
    description:
      "Spruce bent under deep fresh snow near Singhampton, the field swept flat and empty in front of them.",
    productId: "singhampton",
    seconds: 56,
  },
  {
    id: "the-grotto",
    title: "The Grotto",
    videoUrl: `${films}/the-grotto.mp4`,
    posterUrl: `${blob}/the-grotto-poster.jpg`,
    description:
      "The limestone cliffs and turquoise water of the Grotto near Tobermory, the cave mouth held back until the final passes.",
    productId: "the-grotto-painting",
    seconds: 54,
  },
  {
    id: "top-of-blue-mountain",
    title: "Top of Blue Mountain",
    videoUrl: `${films}/top-of-blue-mountain.mp4`,
    posterUrl: `${blob}/top-of-blue-mountain-poster.jpg`,
    description:
      "Autumn maple at the top of Blue Mountain, built from the trunks outward until the canopy closes over.",
    productId: "top-of-blue-mountain",
    seconds: 56,
  },
];

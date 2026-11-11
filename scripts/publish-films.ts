/**
 * Publish the finished making-of films: upload each mp4 and its poster to
 * Vercel Blob, then create the MakingOf row the live site reads.
 *
 * Run with:  npx tsx scripts/publish-films.ts [--dry-run]
 *
 * Safe to re-run: a film already in the database is skipped, so nothing is
 * uploaded twice. Writes are single statements (create), never createMany,
 * because the Neon HTTP adapter cannot batch outside a transaction.
 */

import dotenv from "dotenv";
// Next.js loads .env.local automatically; a plain tsx script does not, and the
// blob token lives there. Load both, .env.local winning.
dotenv.config();
dotenv.config({ path: ".env.local", override: true });
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { put } from "@vercel/blob";
import { blobToken } from "./blob-token";
import { posterSizes } from "../data/making-of-poster-sizes";

const DRY = process.argv.includes("--dry-run");
const VIDEO_DIR = "/Users/jportman/Documents/To make paintings/Final Videos";

/** Top-level MP4 box order, enough of it to see whether moov comes before mdat. */
function topLevelBoxes(file: string, limit = 6): string[] {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  const out: string[] = [];
  let off = 0;
  try {
    while (off + 8 <= size && out.length < limit) {
      const b = Buffer.alloc(16);
      if (fs.readSync(fd, b, 0, 16, off) < 8) break;
      let len = b.readUInt32BE(0);
      const type = b.toString("latin1", 4, 8);
      if (!/^[\x20-\x7e]{4}$/.test(type)) break;
      if (len === 1) len = Number(b.readBigUInt64BE(8));
      else if (len === 0) len = size - off;
      if (len < 8) break;
      out.push(type);
      off += len;
    }
  } finally {
    fs.closeSync(fd);
  }
  return out;
}

const isFaststart = (boxes: string[]) => {
  const m = boxes.indexOf("moov");
  const d = boxes.indexOf("mdat");
  return m !== -1 && (d === -1 || m < d);
};

/**
 * Return a copy of the film with its moov atom at the front, remuxing if it
 * isn't already there.
 *
 * The editor writes moov last, which means a player that wants the duration has
 * to read to the end of a 10-30MB file before it can show anything. Seventeen
 * of the first twenty-two films shipped that way, and that — with stills that
 * were fetched whatever `preload` said — is how a 444MB Blob store billed
 * 9.11GB of transfer in a month.
 *
 * `-c copy` is a stream copy: containers are rewritten, pixels are not touched.
 */
function faststartCopy(videoPath: string, id: string): { path: string; remuxed: boolean } {
  if (isFaststart(topLevelBoxes(videoPath))) return { path: videoPath, remuxed: false };

  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "faststart-")), `${id}.mp4`);
  execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-y", "-i", videoPath, "-c", "copy", "-movflags", "+faststart", out]);

  const boxes = topLevelBoxes(out);
  if (!isFaststart(boxes)) {
    throw new Error(`${id}: remux did not put moov first (${boxes.join(" ")}) — refusing to upload`);
  }
  return { path: out, remuxed: true };
}

const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url)
    ? new PrismaNeonHttp(url, {})
    : new PrismaPg({ connectionString: url }),
});

type Film = {
  id: string;
  title: string;
  file: string;
  productId: string | null;
  description: string;
  /** rounded runtime — The Grotto is trimmed to 54s so its music and picture end together */
  seconds: number;
  /** re-upload over an already-published film (a re-rendered painting); the row keeps its id and sort order */
  replace?: boolean;
  /**
   * Cut number for a replacement, used in the blob path (`<id>-v<n>`). Bump it on
   * every re-render: reusing a path means the CDN keeps serving the old cut.
   * Defaults to 2, which is what every earlier replacement used.
   */
  version?: number;
};

// Northwinds Beach returned to the catalogue on 8 Sep 2026 (repainted), so its
// film is published with the rest.
const FILMS: Film[] = [
  {
    id: "manitoulin-island",
    title: "Manitoulin Island",
    file: "Manitoulin Island - making of.mp4",
    productId: "manitoulin-island",
    description:
      "The long view over the North Channel from the Manitoulin escarpment, the green foreground laid in first, the water and the far hills brought up behind it.",
    seconds: 56,
  },
  {
    id: "northwinds-beach",
    title: "Northwinds Beach",
    file: "Northwinds Beach - making of.mp4",
    productId: "northwinds-beach",
    description:
      "A wave breaking on the wet sand at Northwinds Beach at dusk: the whole scene washed in pale first, the dark water worked over it, and the foam left until last.",
    seconds: 56,
  },
  {
    id: "beaver-river-access",
    title: "Beaver River Access",
    file: "Beaver River Access - making of.mp4",
    productId: "beaver-river-access",
    description:
      "The lily pads and reeds at the Beaver River access point, the water laid in first and the pads floated on last.",
    seconds: 56,
  },
  {
    id: "blue-mountain-sunset",
    title: "Blue Mountain Sunset",
    file: "Blue Mountain Sunset - making of.mp4",
    productId: "blue-mountain-sunset-painting",
    description:
      "A bank of altocumulus catching the last light over Blue Mountain, worked from the orange cloud bank down into the pale sky beneath it.",
    seconds: 56,
  },
  {
    id: "bruce-trail-grey-highlands",
    title: "Bruce Trail in the Grey Highlands",
    file: "Bruce Trail in the Grey Highlands - making of.mp4",
    productId: "bruce-trail",
    description:
      "A cascade over moss-covered boulders in the Grey Highlands, the rocks massed in before the white water runs over them.",
    seconds: 56,
  },
  {
    id: "bruce-trail-epping",
    title: "Bruce Trail at Epping",
    file: "Bruce Trail at Epping - making of.mp4",
    productId: "bruce-trail-epping",
    description:
      "Deep snow on the conifers along the Bruce Trail at Epping, the dark trunks set against the sky before the snow is heaped on.",
    seconds: 56,
  },
  {
    id: "local-farm-sunflowers",
    title: "Local Farm",
    file: "Local Farm Sunflowers - making of.mp4",
    productId: "local-farm-painting",
    description:
      "The sunflower fence line in Simcoe County, painted from the photograph: the barn and the field blocked in first, then the sky, and the flower heads last.",
    seconds: 56,
  },
  {
    id: "peasemarsh",
    title: "Peasemarsh",
    file: "Peasemarsh - making of.mp4",
    productId: "peasemarsh",
    description:
      "Autumn on the Georgian Bay shoreline near Craigleith, the first snow already down on the gravel.",
    seconds: 56,
  },
  {
    id: "blue-mountain-trail",
    title: "Blue Mountain Trail",
    file: "Blue Mountain Trail - making of.mp4",
    productId: "blue-mountain-trail-painting",
    description:
      "A hardwood trail near the Alpine Ski Club turning gold: the trunks massed in first, the leaf litter and the path itself left until last.",
    seconds: 56,
  },
  {
    id: "alpine-ski-fall",
    title: "Alpine Ski Club: Fall",
    file: "Alpine Ski Club in the Fall - making of.mp4",
    productId: "alpine-ski-fall",
    description:
      "The slopes of the Alpine Ski Club before the first snow, the autumn trees blocked in first and the path and the sky opened up after them.",
    seconds: 56,
  },
  {
    id: "council-beach",
    title: "Council Beach",
    file: "Council Beach - making of.mp4",
    productId: "council-beach",
    description:
      "Winter light at Council Beach: the escarpment and treeline blocked in first, then the broken ice worked up under a low sun.",
    seconds: 56,
  },
  {
    id: "bridal-veil-falls",
    title: "Bridal Veil Falls",
    file: "Bridal Veil Falls - making of.mp4",
    productId: "bridal-veil-falls-painting",
    description:
      "The wide curtain of Bridal Veil Falls at Kagawong, laid in from the dark limestone behind and finished with the falling water.",
    seconds: 56,
  },
  {
    id: "inglis-falls",
    title: "Inglis Falls, Owen Sound",
    file: "Inglis Falls - making of.mp4",
    productId: "inglis-falls",
    description:
      "The Sydenham River dropping off the escarpment south of Owen Sound: the rock staircase blocked in first, the white water last.",
    seconds: 56,
  },
  {
    id: "top-of-blue-mountain",
    title: "Top of Blue Mountain",
    file: "Top of Blue Mountain - making of.mp4",
    productId: "top-of-blue-mountain",
    description:
      "Autumn maple at the top of Blue Mountain, built from the trunks outward until the canopy closes over.",
    seconds: 56,
  },
  {
    id: "ravenna-canola",
    title: "Ravenna Canola",
    file: "Ravenna Canola - making of.mp4",
    productId: "ravenna-canola-painting",
    description:
      "A canola field rolling over the Grey Highlands, the field blocked in dark green first and the yellow laid on over it.",
    seconds: 56,
  },
  {
    id: "the-grotto",
    title: "The Grotto",
    file: "The Grotto - making of.mp4",
    productId: "the-grotto-painting",
    description:
      "The limestone cliffs and turquoise water of the Grotto near Tobermory, the cave mouth held back until the final passes.",
    seconds: 54,
  },
  {
    id: "blue-mountain-sunrise",
    title: "Blue Mountain Sunrise",
    file: "Blue Mountain Sunrise - making of.mp4",
    productId: "blue-mountain-sunrise-painting",
    description:
      "A winter sunrise over the Blue Mountains, the sky worked from the darks upward into pink and gold.",
    seconds: 56,
  },
  {
    id: "near-killarney",
    title: "Near Killarney",
    file: "Near Killarney - making of.mp4",
    productId: "near-killarney",
    description:
      "A granite point on the Killarney shore, the pines massed in before the still water takes their reflection.",
    seconds: 56,
  },
  {
    id: "scenic-caves",
    title: "Scenic Caves",
    file: "Scenic Caves - making of.mp4",
    productId: "scenic-caves",
    description:
      "Low winter sun across the groomed trails at Scenic Caves: the bare hardwoods massed in first and the long blue shadows laid across the snow straight after.",
    seconds: 56,
  },
  {
    id: "singhampton",
    title: "Singhampton",
    file: "Singhampton - making of.mp4",
    productId: "singhampton",
    description:
      "Spruce bent under deep fresh snow near Singhampton, the field swept flat and empty in front of them.",
    seconds: 56,
  },
  {
    id: "delphi-point",
    title: "Delphi Point",
    file: "Delphi Point - making of.mp4",
    productId: "delphi-point-painting",
    description:
      "Limestone shelves running out into the waves at Delphi Point, the broken autumn sky worked up from the darks.",
    seconds: 56,
  },
  {
    id: "lora-bay",
    title: "Lora Bay",
    file: "Lora Bay - making of.mp4",
    productId: "lora-bay",
    description:
      "Winter light on the hard blue water at Lora Bay, the open water laid in first, the escarpment behind it next, and the snow-covered spit after both.",
    seconds: 56,
  },
];

async function nextSortOrder() {
  const max = await prisma.makingOf.aggregate({ _max: { sortOrder: true } });
  return (max._max.sortOrder ?? 0) + 1;
}

async function main() {
  if (!DRY && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set — check .env.local. Nothing uploaded.");
    process.exit(1);
  }
  console.log(DRY ? "DRY RUN — nothing uploaded, nothing written\n" : "Publishing films\n");
  let created = 0, skipped = 0;

  for (const f of FILMS) {
    const existing = await prisma.makingOf.findUnique({ where: { id: f.id } });
    if (existing && !f.replace) {
      console.log(`   skip     ${f.id} (already published)`);
      skipped++;
      continue;
    }
    if (!existing && f.replace) {
      console.log(`!! ${f.id}: marked replace but no existing row — publishing as new`);
    }

    const videoPath = path.join(VIDEO_DIR, f.file);
    const posterPath = path.join(VIDEO_DIR, "posters", `${f.id}-poster.jpg`);
    for (const p of [videoPath, posterPath]) {
      if (!fs.existsSync(p)) {
        console.log(`!! ${f.id}: missing ${p}`);
        return;
      }
    }
    const vBytes = fs.statSync(videoPath).size;
    const pBytes = fs.statSync(posterPath).size;
    console.log(`   ${f.replace && existing ? "replace " : "publish "} ${f.id}  video ${(vBytes / 1048576).toFixed(1)}MB  poster ${(pBytes / 1024).toFixed(0)}KB`);
    if (DRY) { created++; continue; }

    // A replacement gets a new path: the same URL would be served from CDN cache
    // long after the file underneath changed.
    const key = f.replace && existing ? `${f.id}-v${f.version ?? 2}` : f.id;

    // Films live under faststart/ and are expected to have moov at the front.
    // Publishing one that doesn't is the bug this prefix exists to mark as fixed.
    const ready = faststartCopy(videoPath, f.id);
    if (ready.remuxed) console.log(`            remuxed for faststart before upload`);

    const video = await put(`making-of/faststart/${key}.mp4`, fs.readFileSync(ready.path), {
      token: blobToken(),
      access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true,
    });

    // The player reserves its box from this table, so a film missing from it
    // renders at 4:3 and shifts on load. Loud, not fatal — a wrong-shaped
    // placeholder is not worth failing a publish over.
    if (!posterSizes[f.id]) {
      console.log(`!! ${f.id}: no entry in data/making-of-poster-sizes.ts — add one (ffprobe the poster) or it renders 4:3`);
    }
    const poster = await put(`making-of/${key}-poster.jpg`, fs.readFileSync(posterPath), {
      token: blobToken(),
      access: "public", contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true,
    });
    if (existing) {
      await prisma.makingOf.update({
        where: { id: f.id },
        data: { videoUrl: video.url, posterUrl: poster.url, description: f.description, seconds: f.seconds },
      });
      console.log(`            replaced -> ${video.url}`);
    } else {
      await prisma.makingOf.create({
        data: {
          id: f.id, title: f.title, videoUrl: video.url, posterUrl: poster.url,
          description: f.description, productId: f.productId, seconds: f.seconds,
          visible: true, sortOrder: await nextSortOrder(),
        },
      });
      console.log(`            -> ${video.url}`);
    }
    created++;
  }
  console.log(`\npublished ${created}, skipped ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

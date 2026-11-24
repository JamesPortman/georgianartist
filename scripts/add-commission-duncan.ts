/**
 * One-off (Nov 24, 2026): add Duncan, the first commission example with a
 * making-of film, to the LIVE /commissions page.
 *
 * What it does:
 *   1. the painting: re-encoded with prepareHomePhoto() and stamped with the
 *      artist's copyright, exactly as the admin's upload does, then stored in
 *      the private store under commissions/ (served through /media)
 *   2. the film and its still: to the public store under commissions/ (the
 *      /media route serves images only, and a film is too large for it); the
 *      still is the finished painting, so it carries the copyright notice too
 *   3. the CommissionExample row: pet, visible, last in the admin's order
 *
 * The example names the subject only, never the client (lib/commissions.ts).
 *
 * Run with:
 *   cd /Users/jportman/NewSite && DATABASE_ALLOW_HOST=<production host> /opt/homebrew/bin/npx tsx scripts/add-commission-duncan.ts [--dry-run]
 *
 * Safe to re-run: if an example named Duncan already has a film, nothing is
 * uploaded or written. The page shows it within the hour, or at once after
 * "Refresh site" in the admin.
 */

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { put } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { embedCopyright } from "../lib/image-copyright";
import { prepareHomePhoto } from "../lib/home-photo";
import { mediaPath, privateBlobToken } from "../lib/private-blob";
import { blobToken } from "./blob-token";

const DRY = process.argv.includes("--dry-run");

const STUDIO = "/Users/jportman/Documents/To make paintings/Commissions - Duncan Puppy v2/For the website";
const IMAGE = path.join(STUDIO, "Duncan Puppy - product image (D, 2400px).jpg");
const POSTER = path.join(STUDIO, "duncan-puppy-poster.jpg");
const FILM = path.join(STUDIO, "Duncan Puppy - making of (re-timed).mp4");

const EXAMPLE = {
  kind: "pet",
  name: "Duncan",
  subject: "Australian shepherd puppy",
  medium: "Digital oil painting, printed on canvas",
  size: "16 x 22 in",
} as const;

/** True when the MP4's moov atom comes before its mdat, so playback starts on a small read. */
function isFaststart(file: string): boolean {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  const boxes: string[] = [];
  let off = 0;
  try {
    while (off + 8 <= size && boxes.length < 8) {
      const b = Buffer.alloc(16);
      if (fs.readSync(fd, b, 0, 16, off) < 8) break;
      let len = b.readUInt32BE(0);
      const type = b.toString("latin1", 4, 8);
      if (len === 1) len = Number(b.readBigUInt64BE(8));
      else if (len === 0) len = size - off;
      if (len < 8) break;
      boxes.push(type);
      off += len;
    }
  } finally {
    fs.closeSync(fd);
  }
  const m = boxes.indexOf("moov");
  const d = boxes.indexOf("mdat");
  return m !== -1 && (d === -1 || m < d);
}

const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url) ? new PrismaNeonHttp(url, {}) : new PrismaPg({ connectionString: url }),
});

async function main() {
  console.log(DRY ? "DRY RUN: nothing uploaded, nothing written\n" : "Adding Duncan to /commissions\n");

  for (const f of [IMAGE, POSTER, FILM]) {
    if (!fs.existsSync(f)) {
      console.log(`!! missing ${f}`);
      process.exitCode = 1;
      return;
    }
  }
  if (!isFaststart(FILM)) {
    console.log(`!! ${FILM} is not faststart (moov after mdat); re-encode with -movflags +faststart first`);
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.commissionExample.findFirst({ where: { name: EXAMPLE.name } });
  if (existing?.filmUrl) {
    console.log(`   skip     ${EXAMPLE.name} (already on /commissions with its film)`);
    return;
  }

  // The painting, the same way the admin stores an example (app/actions/commissions.ts).
  const image = embedCopyright(await prepareHomePhoto(fs.readFileSync(IMAGE)));
  const blur = await sharp(image).resize(16).jpeg({ quality: 50 }).toBuffer();
  const blurDataURL = `data:image/jpeg;base64,${blur.toString("base64")}`;
  const poster = embedCopyright(fs.readFileSync(POSTER));
  const film = fs.readFileSync(FILM);
  console.log(`   image    ${(image.length / 1e6).toFixed(1)} MB  (metadata stripped, copyright stamped)`);
  console.log(`   poster   ${(poster.length / 1e6).toFixed(1)} MB`);
  console.log(`   film     ${(film.length / 1e6).toFixed(1)} MB  (faststart)`);
  if (DRY) return;

  const privateToken = privateBlobToken();
  const imageUrl = privateToken
    ? mediaPath(
        (
          await put("commissions/example.jpg", image, {
            access: "private",
            token: privateToken,
            contentType: "image/jpeg",
            addRandomSuffix: true,
          })
        ).pathname
      )
    : (
        await put("commissions/example.jpg", image, {
          access: "public",
          token: blobToken(),
          contentType: "image/jpeg",
          addRandomSuffix: true,
        })
      ).url;
  console.log(`   uploaded ${imageUrl}`);

  const posterBlob = await put("commissions/duncan-poster.jpg", poster, {
    access: "public",
    token: blobToken(),
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });
  console.log(`   uploaded ${posterBlob.url}`);
  const filmBlob = await put("commissions/duncan-making-of.mp4", film, {
    access: "public",
    token: blobToken(),
    contentType: "video/mp4",
    addRandomSuffix: true,
    multipart: true,
  });
  console.log(`   uploaded ${filmBlob.url}`);

  if (existing) {
    // An example added by hand in the admin: keep it, add the film.
    await prisma.commissionExample.update({
      where: { id: existing.id },
      data: { filmUrl: filmBlob.url, filmPosterUrl: posterBlob.url, visible: true },
    });
    console.log(`   update   ${existing.id}: film added, visible`);
  } else {
    const max = await prisma.commissionExample.aggregate({ _max: { sortOrder: true } });
    const row = await prisma.commissionExample.create({
      data: {
        ...EXAMPLE,
        image: imageUrl,
        blurDataURL,
        filmUrl: filmBlob.url,
        filmPosterUrl: posterBlob.url,
        visible: true,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
      },
    });
    console.log(`   create   ${row.id}: ${EXAMPLE.name}, visible`);
  }
  console.log("\nDone. /commissions shows it within the hour, or at once after Refresh site in the admin.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

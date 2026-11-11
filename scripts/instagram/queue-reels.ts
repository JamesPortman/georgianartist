/**
 * CLI script to queue Reels from the local making-of cuts.
 *
 * Runs outside of Next.js — uses dotenv to load .env.local (needs
 * BLOB_READ_WRITE_TOKEN, DATABASE_URL and ANTHROPIC_API_KEY).
 *
 * Usage:
 *   npx tsx scripts/instagram/queue-reels.ts "~/Documents/Instagram/Reels"
 *   npx tsx scripts/instagram/queue-reels.ts "~/Documents/Instagram/Reels" --commit
 *
 * ANTHROPIC_API_KEY is Production-only in Vercel and can't be pulled down, so
 * it is often absent locally. Without it the reels are queued with a
 * placeholder caption and you click "Regenerate caption" in /admin/instagram,
 * which runs in production where the key does exist. Pass --no-caption to force
 * that behaviour even when a key is present.
 *
 * Default is a DRY RUN: it matches files to catalogue works and prints what it
 * would do, without uploading or writing anything. --commit does the work.
 *
 * For each unqueued file it uploads the mp4 to Blob, drafts a caption with the
 * same generator the image posts use, and adds a "pending" InstagramPost of
 * type "reel". Nothing publishes until it's approved in /admin/instagram.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFileSync, readdirSync } from "fs";
import { basename, join } from "path";
import { homedir } from "os";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { put } from "@vercel/blob";
import { blobToken } from "../blob-token";
import {
  fetchMediaFingerprint,
  generateCaption,
} from "../../lib/instagram";
import type { PostProductData } from "../../lib/instagram";

const dbUrl = process.env.DATABASE_URL!;
const adapter = /neon\.tech/i.test(dbUrl)
  ? new PrismaNeonHttp(dbUrl, {})
  : new PrismaPg({ connectionString: dbUrl });
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({ adapter });

/** Reel filenames come from the film titles, which don't always match the
 *  catalogue title exactly ("Alpine Ski Club in the Fall" vs "Alpine Ski Club:
 *  Fall"). Compare on normalised word sets rather than exact strings. */
function words(s: string): Set<string> {
  const stop = new Set(["the", "a", "an", "at", "in", "of", "on", "to"]);
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w && !stop.has(w))
  );
}

/** Jaccard overlap — 1.0 is identical, 0 shares nothing. */
function similarity(a: string, b: string): number {
  const A = words(a), B = words(b);
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / new Set([...A, ...B]).size;
}

const MATCH_FLOOR = 0.45; // below this, ask a human rather than guess

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  // No local Anthropic key is the normal case, not an error — queue a
  // placeholder and let the admin (which runs in production) write the caption.
  const skipCaption = args.includes("--no-caption") || !process.env.ANTHROPIC_API_KEY;
  const dirArg = args.find((a) => !a.startsWith("--"));
  if (!dirArg) {
    console.error('Usage: npx tsx scripts/instagram/queue-reels.ts "<reels dir>" [--commit]');
    process.exit(1);
  }
  const dir = dirArg.replace(/^~/, homedir());

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".mp4"));
  if (!files.length) {
    console.error(`No .mp4 files in ${dir}`);
    process.exit(1);
  }

  // Read the catalogue immediately before writing to it — the seed files and
  // any listing from earlier in the day can both be out of date.
  const products = await prisma.product.findMany({
    // Sold-out work is excluded for the same reason generate-posts excludes
    // it: the caption sells something nobody can order.
    where: { type: "painting", visible: true, soldOut: false },
  });
  const queued = await prisma.instagramPost.findMany({
    where: { type: "reel" },
    select: { productId: true },
  });
  const alreadyQueued = new Set(queued.map((q) => q.productId).filter(Boolean));

  console.log(
    `\n${files.length} file(s), ${products.length} visible paintings, ` +
    `${alreadyQueued.size} reel(s) already queued.` +
    (commit ? "\n" : "  DRY RUN — pass --commit to upload and queue.\n")
  );
  if (skipCaption) {
    console.log(
      process.env.ANTHROPIC_API_KEY
        ? "Captions skipped (--no-caption). Regenerate them in /admin/instagram.\n"
        : "No ANTHROPIC_API_KEY locally — queueing placeholder captions. " +
          'Click "Regenerate caption" on each in /admin/instagram.\n'
    );
  }

  let added = 0, skipped = 0, unmatched = 0;

  for (const file of files.sort()) {
    const title = basename(file, ".mp4").replace(/\s*-\s*reel$/i, "");

    let best = products[0];
    let bestScore = 0;
    for (const p of products) {
      const score = similarity(title, p.title);
      if (score > bestScore) { bestScore = score; best = p; }
    }

    if (!best || bestScore < MATCH_FLOOR) {
      console.log(`  ?  "${title}" — no confident catalogue match (best ${bestScore.toFixed(2)}); skipped`);
      unmatched++;
      continue;
    }
    if (alreadyQueued.has(best.id)) {
      console.log(`  ·  "${title}" → ${best.id} — already queued`);
      skipped++;
      continue;
    }

    console.log(`  →  "${title}" → ${best.id} ("${best.title}", match ${bestScore.toFixed(2)})`);
    if (!commit) { added++; continue; }

    try {
      const blob = await put(`reels/${best.id}.mp4`, readFileSync(join(dir, file)), {
        token: blobToken(),
        access: "public",
        contentType: "video/mp4",
        addRandomSuffix: true,
      });

      const data: PostProductData = {
        id: best.id,
        title: best.title,
        type: "painting",
        category: best.category,
        sizeType: best.sizeType,
        price: best.price,
        description: best.description,
        image: best.image,
      };

      const caption = skipCaption
        ? `Caption pending for "${best.title}" — regenerate before approving.`
        : await generateCaption(data);

      await prisma.instagramPost.create({
        data: {
          type: "reel",
          productId: best.id,
          imageUrl: blob.url,
          caption,
          status: "pending",
          mediaFingerprint: await fetchMediaFingerprint(blob.url),
        },
      });
      console.log(`     ✓ uploaded and queued`);
      added++;
    } catch (err: unknown) {
      console.log(`     ✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\n${commit ? "Queued" : "Would queue"} ${added}; ${skipped} already queued; ` +
    `${unmatched} unmatched.${commit ? " Visit /admin/instagram to approve.\n" : "\n"}`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

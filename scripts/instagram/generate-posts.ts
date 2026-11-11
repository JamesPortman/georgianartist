/**
 * CLI script to bulk-generate Instagram post captions from the live DB.
 * Runs outside of Next.js — uses dotenv to load .env.local.
 *
 * Usage:
 *   npx tsx scripts/instagram/generate-posts.ts [count]
 *
 * Example:
 *   npx tsx scripts/instagram/generate-posts.ts 9   # generate 9 posts
 *
 * The script adds "pending" posts to the InstagramPost table.
 * Then visit /admin/instagram to review and approve them.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  absoluteImageUrl,
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

async function main() {
  const count = parseInt(process.argv[2] ?? "6", 10);
  if (isNaN(count) || count < 1) {
    console.error("Usage: npx tsx scripts/instagram/generate-posts.ts [count]");
    process.exit(1);
  }

  console.log(`\nGenerating ${count} Instagram post captions…\n`);

  // Skip any product that already has a post record — including "skipped"
  // (skipping is a deliberate "never queue this again" signal) and "posting".
  const existing = await prisma.instagramPost.findMany({
    where: { productId: { not: null } },
    select: { productId: true },
  });
  const usedIds = new Set(
    existing.map((e) => e.productId).filter((id): id is string => id !== null)
  );

  const [paintings, photographs] = await Promise.all([
    prisma.product.findMany({
      // Sold-out work never enters the queue: a caption quotes a price range
      // and invites a purchase, and the cron would publish it weeks later.
      where: { type: "painting", visible: true, soldOut: false, id: { notIn: [...usedIds] } },
      orderBy: { sortOrder: "asc" },
      take: Math.ceil(count * 0.67),
    }),
    prisma.product.findMany({
      where: { type: "photograph", visible: true, soldOut: false, id: { notIn: [...usedIds] } },
      orderBy: { sortOrder: "asc" },
      take: Math.ceil(count * 0.33),
    }),
  ]);

  console.log(`Found ${paintings.length} paintings, ${photographs.length} photographs to use.`);

  // Interleave painting, painting, photo
  const candidates: typeof paintings = [];
  const p = [...paintings];
  const q = [...photographs];
  while (candidates.length < count && (p.length || q.length)) {
    for (const next of [p.shift(), p.shift(), q.shift()]) {
      if (next && candidates.length < count) candidates.push(next);
    }
  }

  let added = 0;
  for (const product of candidates) {
    process.stdout.write(`  → "${product.title}"… `);
    try {
      const data: PostProductData = {
        id: product.id,
        title: product.title,
        type: product.type as "painting" | "photograph",
        category: product.category,
        sizeType: product.sizeType,
        price: product.price,
        description: product.description,
        image: product.image,
      };
      const caption  = await generateCaption(data);
      const imageUrl = absoluteImageUrl(product.image);

      await prisma.instagramPost.create({
        data: {
          type: product.type,
          productId: product.id,
          imageUrl,
          caption,
          status: "pending",
          mediaFingerprint: await fetchMediaFingerprint(imageUrl),
        },
      });
      console.log("✓");
      added++;
    } catch (err: unknown) {
      console.log(`✗  ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nDone. Added ${added}/${count} posts. Visit /admin/instagram to approve.\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

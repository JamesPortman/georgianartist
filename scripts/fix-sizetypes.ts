/**
 * Repainted works that changed shape. The old images were the uncropped A4
 * sheet (2339x1654, 1.41); the painterly ones are cropped to the canvas the
 * strokes were actually laid on, which is the source photograph's own frame.
 *
 * The Grotto and Top of Blue Mountain went first. Blue Mountain Trail is the
 * same story: a 2:1 photograph whose painting was being sold as a 4:3.
 *
 * sizeType drives the print sizes and prices, so leaving them as "landscape"
 * would offer 16x12 and 24x18 for a 2:1 picture — the print would be cropped.
 *
 * This moves them to "panoramic", which changes what they sell for:
 *   landscape  16x12 / 24x18 / 32x24   from CA$99
 *   panoramic  20x10 / 24x12 / 40x20   from CA$89
 *
 * Run with:  npx tsx scripts/fix-sizetypes.ts [--dry-run]
 * Safe to re-run; a product already panoramic is skipped.
 */

import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: ".env.local", override: true });
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const DRY = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url)
    ? new PrismaNeonHttp(url, {})
    : new PrismaPg({ connectionString: url }),
});

const CHANGES = [
  { id: "the-grotto-painting", sizeType: "panoramic", price: 89 },
  { id: "top-of-blue-mountain", sizeType: "panoramic", price: 89 },
  { id: "blue-mountain-trail-painting", sizeType: "panoramic", price: 89 },
];

async function main() {
  console.log(DRY ? "DRY RUN — nothing written\n" : "Updating the live catalogue\n");
  let updated = 0, skipped = 0;
  for (const c of CHANGES) {
    const row = await prisma.product.findUnique({ where: { id: c.id } });
    if (!row) { console.log(`!! ${c.id} not found`); continue; }
    if (row.sizeType === c.sizeType) {
      console.log(`   skip     ${c.id} (already ${c.sizeType})`); skipped++; continue;
    }
    console.log(`   update   ${c.id}  ${row.sizeType} CA$${row.price}  ->  ${c.sizeType} CA$${c.price}`);
    if (!DRY) {
      await prisma.product.update({
        where: { id: c.id },
        data: { sizeType: c.sizeType, price: c.price },
      });
    }
    updated++;
  }
  console.log(`\nupdated ${updated}, skipped ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

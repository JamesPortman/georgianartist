/**
 * Scenic Caves (2339x938, r=2.49) and Delphi Point (2339x960, r=2.44) were sold
 * as "panoramic", whose sizes are all exactly 2:1. Printing either one would
 * have cost ~20% of its width at the printer — and in both paintings the width
 * is the subject: low sun raking across the trails, and the run of the
 * shoreline.
 *
 * The new "ultrawide" family (20x8, 25x10, 40x16 — all 2.5) holds them with a
 * 0-3% crop instead. Sizes were chosen against CanvasChamp.ca cost rather than
 * geometry: 40x16 is C$34 for 640 sq in, better value per square inch than
 * anything else in the catalogue.
 *
 * Run with:  npx tsx scripts/fix-ultrawide.ts [--dry-run]
 * Safe to re-run; a product already ultrawide is skipped.
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
  { id: "scenic-caves", sizeType: "ultrawide", price: 89 },
  { id: "delphi-point-painting", sizeType: "ultrawide", price: 89 },
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

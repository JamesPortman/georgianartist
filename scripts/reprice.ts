/**
 * Retail repricing against real CanvasChamp.ca cost (0.75" thin wrap, CAD).
 *
 * Everything in the catalogue ran an 83-89% margin except the two entry sizes,
 * which sat at 75%:
 *
 *   16x12 / 12x16   cost C$24.46   sold C$99    75%
 *   24x18 / 18x24   cost C$21.75   sold C$199   89%
 *
 * The 16x12 costs MORE to produce than the 24x18 that is twice the price —
 * CanvasChamp prices 24x18 unusually cheaply (C$0.046/sq in against C$0.116).
 * So the entry sizes move to C$119, giving 79%, and the ladder stops being
 * upside-down. Nothing else changes; every other size was already fine.
 *
 * Also sets the two ultrawide products to C$89, the lowest sale price in that
 * new family.
 *
 * Run with:  npx tsx scripts/reprice.ts [--dry-run]
 * Safe to re-run; a product already at its target price is skipped.
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

/** Base price = the lowest sale price offered for that size family. */
const TARGET: Record<string, number> = {
  landscape: 119,
  portrait: 119,
  ultrawide: 89,
};

async function main() {
  console.log(DRY ? "DRY RUN — nothing written\n" : "Repricing the live catalogue\n");
  const rows = await prisma.product.findMany({ select: { id: true, sizeType: true, price: true } });
  let updated = 0, skipped = 0;
  for (const r of rows) {
    const want = TARGET[r.sizeType ?? ""];
    if (want === undefined) continue;
    if (r.price === want) { skipped++; continue; }
    console.log(`   ${r.id.padEnd(34)} ${(r.sizeType ?? "").padEnd(10)} CA$${r.price} -> CA$${want}`);
    if (!DRY) await prisma.product.update({ where: { id: r.id }, data: { price: want } });
    updated++;
  }
  console.log(`\nupdated ${updated}, unchanged ${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

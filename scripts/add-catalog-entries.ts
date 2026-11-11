/**
 * One-off: add the missing photograph entries and two new paintings to the
 * LIVE catalogue, and attach Near Killarney's inspiration photo.
 *
 * The seed files (data/photographs.ts, data/products.ts) only feed a fresh
 * `npm run db:seed` — the live site reads the Product table, so these rows
 * have to be written directly.
 *
 * Run with:  npx tsx scripts/add-catalog-entries.ts [--dry-run]
 *
 * Safe to re-run: each row is checked first and skipped if it already exists.
 * Writes are single statements (create / update), never upsert or createMany,
 * because the Neon HTTP adapter cannot run those outside a transaction.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { photographs } from "../data/photographs";
import { products } from "../data/products";

const DRY = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url)
    ? new PrismaNeonHttp(url, {})
    : new PrismaPg({ connectionString: url }),
});

// Exactly the rows this change introduces — nothing else is touched.
const NEW_PHOTOGRAPH_IDS = [
  "top-of-blue-mountain-photo", "alpine-ski-fall-photo", "beaver-river-access-photo",
  "council-beach-photo", "lora-bay-photo", "bruce-trail-photo",
  "manitoulin-island-photo", "near-killarney-photo", "delphi-point",
  "inglis-falls-photo", "scenic-caves-photo", "singhampton-photo",
];
const NEW_PAINTING_IDS = ["scenic-caves", "singhampton"];

async function nextSortOrder(type: string) {
  const max = await prisma.product.aggregate({
    where: { type },
    _max: { sortOrder: true },
  });
  return (max._max.sortOrder ?? 0) + 1;
}

async function main() {
  console.log(DRY ? "DRY RUN — nothing will be written\n" : "Writing to the live catalogue\n");
  let created = 0, updated = 0, skipped = 0;

  for (const id of NEW_PHOTOGRAPH_IDS) {
    const p = photographs.find((x) => x.id === id);
    if (!p) { console.log(`!! ${id} missing from data/photographs.ts`); continue; }
    if (await prisma.product.findUnique({ where: { id } })) {
      console.log(`   skip     ${id} (already in catalogue)`); skipped++; continue;
    }
    const data = {
      id: p.id, type: "photograph", title: p.title, image: p.image,
      category: p.category, sizeType: p.sizeType, price: p.price,
      description: p.description ?? null,
      naturalWidth: p.naturalWidth, naturalHeight: p.naturalHeight,
      // Photographs reuse the shared GPS columns — the Product table has no
      // lat/lng of its own. prisma/seed.ts maps them the same way.
      inspirationLat: p.lat ?? null, inspirationLng: p.lng ?? null,
      isNew: true, onSale: false, visible: true,
      sortOrder: DRY ? 0 : await nextSortOrder("photograph"),
    };
    console.log(`   create   ${id}  (photograph, ${p.sizeType}, CA$${p.price})`);
    if (!DRY) await prisma.product.create({ data });
    created++;
  }

  for (const id of NEW_PAINTING_IDS) {
    const p = products.find((x) => x.id === id);
    if (!p) { console.log(`!! ${id} missing from data/products.ts`); continue; }
    if (await prisma.product.findUnique({ where: { id } })) {
      console.log(`   skip     ${id} (already in catalogue)`); skipped++; continue;
    }
    const data = {
      id: p.id, type: "painting", title: p.title, image: p.image,
      category: p.category, sizeType: p.sizeType, price: p.price,
      description: p.description ?? null,
      inspirationImage: p.inspirationImage ?? null,
      inspirationLat: p.inspirationLat ?? null,
      inspirationLng: p.inspirationLng ?? null,
      isNew: true, onSale: false, visible: true,
      sortOrder: DRY ? 0 : await nextSortOrder("painting"),
    };
    console.log(`   create   ${id}  (painting, ${p.sizeType}, CA$${p.price})`);
    if (!DRY) await prisma.product.create({ data });
    created++;
  }

  // Two existing products had the wrong coordinates: peasemarsh and
  // delphi-point-painting were pinned to the same spot, so they stacked on the
  // Locations map. James supplied the correct ones.
  const FIX_COORDS: Record<string, { lat: number; lng: number }> = {
    "peasemarsh": { lat: 44.539108, lng: -80.373543 },
    "delphi-point-painting": { lat: 44.548782, lng: -80.422663 },
  };
  for (const [id, c] of Object.entries(FIX_COORDS)) {
    const row = await prisma.product.findUnique({ where: { id } });
    if (!row) { console.log(`!! ${id} not found in the catalogue`); continue; }
    if (row.inspirationLat === c.lat && row.inspirationLng === c.lng) {
      console.log(`   skip     ${id} coordinates (already correct)`); skipped++; continue;
    }
    console.log(`   update   ${id}  ${row.inspirationLat},${row.inspirationLng} -> ${c.lat},${c.lng}`);
    if (!DRY) {
      await prisma.product.update({
        where: { id },
        data: { inspirationLat: c.lat, inspirationLng: c.lng },
      });
    }
    updated++;
  }

  // Near Killarney already exists — it just never got its inspiration photo.
  const nk = await prisma.product.findUnique({ where: { id: "near-killarney" } });
  if (!nk) {
    console.log("!! near-killarney not found in the catalogue");
  } else if (nk.inspirationImage) {
    console.log(`   skip     near-killarney inspirationImage (already ${nk.inspirationImage})`);
    skipped++;
  } else {
    console.log("   update   near-killarney  inspirationImage -> /photographs/near-killarney-photo.jpg");
    if (!DRY) {
      await prisma.product.update({
        where: { id: "near-killarney" },
        data: { inspirationImage: "/photographs/near-killarney-photo.jpg" },
      });
    }
    updated++;
  }

  console.log(`\ncreated ${created}, updated ${updated}, skipped ${skipped}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

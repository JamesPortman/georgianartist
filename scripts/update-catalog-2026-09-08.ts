/**
 * Three catalogue changes from 8 Sep 2026, applied to the LIVE database.
 * The seed files only feed a fresh `npm run db:seed`, so these rows are
 * written directly, the same way scripts/add-catalog-entries.ts does it.
 *
 *   1. "Bruce Trail at Craigleith" becomes "Bruce Trail at Epping".
 *      Product.id is the primary key AND the URL segment, so this is a new
 *      row plus a repointed film — not an update. The old row is HIDDEN
 *      rather than deleted, so the admin analytics dashboard can still
 *      resolve historical events keyed to the old id to a title. Delete it
 *      later if you would rather it were gone. next.config.ts carries a
 *      permanent redirect from the old URL.
 *
 *   2. "Northwinds Beach" returns to the catalogue, repainted 8 Sep 2026.
 *      (It was removed in PR #95.)
 *
 *   3. Local Farm's inspiration coordinates move to the ones James gave.
 *
 * Run with:  npx tsx scripts/update-catalog-2026-09-08.ts [--dry-run]
 *
 * Safe to re-run: every write is checked first and skipped when already done.
 * Single statements only (create / update) — the Neon HTTP adapter cannot
 * batch outside a transaction.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { products } from "../data/products";

const DRY = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url)
    ? new PrismaNeonHttp(url, {})
    : new PrismaPg({ connectionString: url }),
});

const OLD_ID = "bruce-trail-craigleith";
const NEW_ID = "bruce-trail-epping";

async function main() {
  console.log(DRY ? "DRY RUN — nothing will be written\n" : "Writing to the live catalogue\n");

  // --- 1. the rename -------------------------------------------------------
  const old = await prisma.product.findUnique({ where: { id: OLD_ID } });
  const already = await prisma.product.findUnique({ where: { id: NEW_ID } });
  const seed = products.find((p) => p.id === NEW_ID);
  if (!seed) throw new Error(`${NEW_ID} missing from data/products.ts`);

  if (already) {
    console.log(`   skip     ${NEW_ID} (already in catalogue)`);
  } else if (!old) {
    console.log(`!! ${OLD_ID} not found — nothing to rename`);
  } else {
    console.log(`   create   ${NEW_ID}  (from ${OLD_ID}, keeping its sort order)`);
    if (!DRY) {
      await prisma.product.create({
        data: {
          ...old,
          id: NEW_ID,
          title: seed.title,
          image: seed.image,
          description: seed.description ?? old.description,
          createdAt: old.createdAt,
          updatedAt: new Date(),
        },
      });
    }
    console.log(`   hide     ${OLD_ID}  (kept so analytics can still name it)`);
    if (!DRY) {
      await prisma.product.update({ where: { id: OLD_ID }, data: { visible: false } });
    }
    const film = await prisma.makingOf.findFirst({ where: { productId: OLD_ID } });
    if (film) {
      console.log(`   repoint  film ${film.id} -> ${NEW_ID}`);
      if (!DRY) {
        await prisma.makingOf.update({ where: { id: film.id }, data: { productId: NEW_ID } });
      }
    } else {
      console.log(`   note     no film row points at ${OLD_ID} yet`);
    }
  }

  // --- 2. Northwinds Beach returns ----------------------------------------
  const nw = products.find((p) => p.id === "northwinds-beach");
  if (!nw) throw new Error("northwinds-beach missing from data/products.ts");
  if (await prisma.product.findUnique({ where: { id: nw.id } })) {
    console.log(`   skip     ${nw.id} (already in catalogue)`);
  } else {
    const max = await prisma.product.aggregate({
      where: { type: "painting" },
      _max: { sortOrder: true },
    });
    console.log(`   create   ${nw.id}  (painting, ${nw.sizeType}, CA$${nw.price})`);
    if (!DRY) {
      await prisma.product.create({
        data: {
          id: nw.id, type: "painting", title: nw.title, image: nw.image,
          category: nw.category, sizeType: nw.sizeType, price: nw.price,
          description: nw.description ?? null,
          inspirationImage: nw.inspirationImage ?? null,
          inspirationLat: nw.inspirationLat ?? null,
          inspirationLng: nw.inspirationLng ?? null,
          isNew: true, onSale: false, visible: true,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
    }
  }

  // --- 3. Local Farm coordinates ------------------------------------------
  const lf = products.find((p) => p.id === "local-farm-painting");
  const live = await prisma.product.findUnique({ where: { id: "local-farm-painting" } });
  if (lf && live && (live.inspirationLat !== lf.inspirationLat || live.inspirationLng !== lf.inspirationLng)) {
    console.log(`   update   local-farm-painting  ${live.inspirationLat},${live.inspirationLng} -> ${lf.inspirationLat},${lf.inspirationLng}`);
    if (!DRY) {
      await prisma.product.update({
        where: { id: "local-farm-painting" },
        data: { inspirationLat: lf.inspirationLat, inspirationLng: lf.inspirationLng },
      });
    }
  } else {
    console.log("   skip     local-farm-painting (coordinates already match)");
  }

  // --- 4. Bruce Trail at Epping: pin follows the name ---------------------
  // Renamed on 8 Sep but left carrying its Craigleith coordinate, so the page
  // named a place 13 km from its own pin. This is the Epping-John Muir Lookout
  // as the conservation authority lists it — 2 dp, so good to about 500 m.
  const ep = products.find((p) => p.id === NEW_ID);
  const epLive = await prisma.product.findUnique({ where: { id: NEW_ID } });
  if (ep && epLive && (epLive.inspirationLat !== ep.inspirationLat || epLive.inspirationLng !== ep.inspirationLng)) {
    console.log(`   update   ${NEW_ID}  ${epLive.inspirationLat},${epLive.inspirationLng} -> ${ep.inspirationLat},${ep.inspirationLng}`);
    if (!DRY) {
      await prisma.product.update({
        where: { id: NEW_ID },
        data: { inspirationLat: ep.inspirationLat, inspirationLng: ep.inspirationLng },
      });
    }
  } else {
    console.log(`   skip     ${NEW_ID} coordinates (already match)`);
  }

  console.log(DRY ? "\nDry run complete." : "\nDone.");
}

main().finally(() => prisma.$disconnect());

/**
 * Seed the database from the static TypeScript data files.
 * Run with: npm run db:seed
 *
 * Uses upsert so existing records are updated and new ones inserted.
 * On re-seed, admin edits (visible/onSale/isNew/etc.) are preserved because
 * the `update` clause is empty — only `create` writes the seed values.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { products, SEED_CATALOGUE_OWNER } from "../data/products";
import { siteConfig } from "../data/siteConfig";
import { photographs } from "../data/photographs";
import { makingOfFilms } from "../data/making-of";
import { assertDatabaseAllowed } from "../lib/db-guard";

// Neon: WebSocket pool driver (supports the transactions createMany needs).
// Plain Postgres (CI/E2E): pg adapter, which also supports transactions.
const url = process.env.DATABASE_URL!;
// Off Vercel, only a local or named database (lib/db-guard.ts). Against
// production the seed would put back every sample work the owner has deleted.
assertDatabaseAllowed();
let adapter;
if (/neon\.tech/i.test(url)) {
  neonConfig.webSocketConstructor = ws;
  adapter = new PrismaNeon({ connectionString: url });
} else {
  adapter = new PrismaPg({ connectionString: url });
}
const prisma = new PrismaClient({ adapter });

/**
 * Refuse to plant one artist's catalogue on another artist's site.
 *
 * This repo is meant to be forked. The failure that guard exists for: someone
 * copies it, sets themselves up in data/siteConfig.ts, runs `npm run db:seed`
 * out of habit, and their storefront comes up selling 44 of James's
 * paintings under their own name and copyright notice. Nothing errors, the
 * site looks finished, and it is a copyright problem.
 *
 * `--force` is here because the combination is legitimate while developing
 * against someone else's data. It has to be typed, which is the point.
 */
function assertSeedBelongsHere() {
  if (SEED_CATALOGUE_OWNER === siteConfig.artist) return;
  if (process.argv.includes("--force")) {
    console.warn(
      `! Seeding ${SEED_CATALOGUE_OWNER}'s catalogue into a site configured ` +
        `for ${siteConfig.artist} (--force).`
    );
    return;
  }
  console.error(
    `Refusing to seed.\n\n` +
      `  data/products.ts holds ${SEED_CATALOGUE_OWNER}'s work.\n` +
      `  data/siteConfig.ts says this site belongs to ${siteConfig.artist}.\n\n` +
      `Seeding now would publish one artist's paintings under another's name.\n` +
      `Replace the arrays in data/products.ts and data/photographs.ts with your\n` +
      `own works and update SEED_CATALOGUE_OWNER — or add works through /admin\n` +
      `and skip the seed entirely. Pass --force if you meant it.`
  );
  process.exit(1);
}

async function main() {
  assertSeedBelongsHere();

  // createMany is a single INSERT statement (no transaction), which the Neon
  // HTTP driver supports. skipDuplicates leaves existing rows — and therefore
  // any admin edits — untouched on re-seed.
  const paintingRows = products.map((p, i) => ({
    id: p.id,
    type: "painting",
    title: p.title,
    image: p.image,
    mockupImage: p.mockupImage ?? null,
    category: p.category,
    sizeType: p.sizeType,
    price: p.price,
    description: p.description ?? null,
    isNew: p.isNew ?? false,
    onSale: p.onSale,
    visible: true,
    sortOrder: i,
    // A painting made from one of the catalogued photographs carries that photo
    // and its GPS. Dropping these on seed meant a fresh/CI database rendered no
    // inspiration image or map at all.
    inspirationImage: p.inspirationImage ?? null,
    inspirationLat: p.inspirationLat ?? null,
    inspirationLng: p.inspirationLng ?? null,
  }));

  const photoRows = photographs.map((p, i) => ({
    id: p.id,
    type: "photograph",
    title: p.title,
    image: p.image,
    category: p.category,
    sizeType: p.sizeType,
    price: p.price,
    description: p.description ?? null,
    isNew: p.isNew ?? false,
    onSale: p.onSale ?? false,
    visible: true,
    sortOrder: i,
    naturalWidth: p.naturalWidth,
    naturalHeight: p.naturalHeight,
    // Photographs reuse the shared GPS columns for where they were taken.
    inspirationLat: p.lat ?? null,
    inspirationLng: p.lng ?? null,
  }));

  const paintings = await prisma.product.createMany({
    data: paintingRows,
    skipDuplicates: true,
  });
  console.log(`Paintings: ${paintings.count} inserted`);

  const photos = await prisma.product.createMany({
    data: photoRows,
    skipDuplicates: true,
  });
  console.log(`Photographs: ${photos.count} inserted`);

  const films = await prisma.makingOf.createMany({
    data: makingOfFilms.map((f, i) => ({ ...f, visible: true, sortOrder: i })),
    skipDuplicates: true,
  });
  console.log(`Making-of films: ${films.count} inserted`);

  const total = await prisma.product.count();
  console.log(`Done — ${total} products in database.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * Move what should be private out of the public Blob store, once.
 *
 * The private store (lib/private-blob.ts) was connected in October 2026; until
 * then everything it was meant to hold went to the public store, readable by
 * anyone with the URL (docs/security-review-2026-10.md, finding 1). This moves:
 *   - every catalogue backup under backups/;
 *   - collectors' photos of their homes, for every work;
 *   - the image and inspiration photo of every work that isn't visible yet
 *     (lib/private-move.ts decides which).
 *
 * For each file: copy it to the private store under the same pathname, point
 * the database row at /media/<pathname>, and only then delete the public copy,
 * and only if no row anywhere still references it. Each public file is
 * archived to disk first (.blob-archive/private-move-<time>/), so a mistake is a copy
 * back, not a loss.
 *
 * Run it only after a production deploy that has PRIVATE_BLOB_READ_WRITE_TOKEN:
 * the live /media route needs the token to serve what this moves.
 *
 *   vercel env pull .env.local          # brings both tokens
 *   DATABASE_ALLOW_HOST=<prod host> npx tsx scripts/move-to-private-store.ts           # lists only
 *   DATABASE_ALLOW_HOST=<prod host> npx tsx scripts/move-to-private-store.ts --apply   # moves
 *
 * Safe to re-run: what has moved no longer matches, and copies overwrite
 * themselves with the same bytes.
 */

import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { list, put, del } from "@vercel/blob";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { privateBlobToken } from "../lib/private-blob";
import { planMoves } from "../lib/private-move";
import { blobToken } from "./blob-token";

const APPLY = process.argv.includes("--apply");

const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url) ? new PrismaNeonHttp(url, {}) : new PrismaPg({ connectionString: url }),
});

const publicToken = blobToken();
const privateToken = privateBlobToken();
if (!privateToken) {
  console.error(
    "PRIVATE_BLOB_READ_WRITE_TOKEN is not set. Connect the private store to the project with the prefix " +
      "PRIVATE_BLOB, redeploy production, then `vercel env pull .env.local`. Nothing done."
  );
  process.exit(1);
}

const archiveDir = path.join(".blob-archive", `private-move-${new Date().toISOString().replace(/[:.]/g, "-")}`);

/** Copy one public file into the private store under the same pathname; archive the bytes. */
async function copyToPrivate(from: string, pathname: string): Promise<void> {
  const res = await fetch(from, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not fetch ${from}: ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const archived = path.join(archiveDir, pathname);
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.writeFileSync(archived, bytes);
  await put(pathname, bytes, {
    access: "private",
    token: privateToken!,
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Every URL any row still holds. */
async function referencedUrls(): Promise<Set<string>> {
  const [products, posts, films] = await Promise.all([
    prisma.product.findMany({ select: { image: true, inspirationImage: true, homePhoto: true, mockupImage: true } }),
    prisma.instagramPost.findMany({ select: { imageUrl: true } }),
    prisma.makingOf.findMany({ select: { videoUrl: true, posterUrl: true } }),
  ]);
  const urls = [
    ...products.flatMap((p) => [p.image, p.inspirationImage, p.homePhoto, p.mockupImage]),
    ...posts.map((p) => p.imageUrl),
    ...films.flatMap((f) => [f.videoUrl, f.posterUrl]),
  ];
  return new Set(urls.filter((u): u is string => !!u).map((u) => u.split("?")[0]!));
}

async function moveUploads(): Promise<void> {
  const products = await prisma.product.findMany({
    select: { id: true, visible: true, image: true, inspirationImage: true, homePhoto: true },
  });
  const moves = planMoves(products);
  console.log(`\nUploads to move: ${moves.length}`);
  for (const m of moves) console.log(`  ${m.productId}.${m.field}: ${m.pathname}`);
  if (!APPLY || moves.length === 0) return;

  for (const m of moves) {
    await copyToPrivate(m.from, m.pathname);
    await prisma.product.update({ where: { id: m.productId }, data: { [m.field]: m.to } });
    console.log(`  moved ${m.productId}.${m.field}`);
  }

  // Delete public copies only once every row has moved, and only those no row
  // still points at (an Instagram post can share a work's image URL).
  const stillUsed = await referencedUrls();
  const deletable = moves.map((m) => m.from.split("?")[0]!).filter((u) => !stillUsed.has(u));
  const kept = moves.length - deletable.length;
  if (deletable.length) await del([...new Set(deletable)], { token: publicToken });
  console.log(`  deleted ${new Set(deletable).size} public copies${kept ? `, kept ${kept} still referenced elsewhere` : ""}`);
}

async function moveBackups(): Promise<void> {
  const backups: { url: string; pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "backups/", cursor, limit: 1000, token: publicToken });
    backups.push(...page.blobs.map((b) => ({ url: b.url, pathname: b.pathname })));
    cursor = page.cursor;
  } while (cursor);
  console.log(`\nBackups to move: ${backups.length}`);
  for (const b of backups) console.log(`  ${b.pathname}`);
  if (!APPLY || backups.length === 0) return;

  for (const b of backups) await copyToPrivate(b.url, b.pathname);
  await del(backups.map((b) => b.url), { token: publicToken });
  console.log(`  moved ${backups.length} backups and deleted the public copies`);
}

async function main() {
  console.log(APPLY ? `Moving (archive: ${archiveDir})` : "Dry run: listing only. Add --apply to move.");
  await moveUploads();
  await moveBackups();
  console.log(APPLY ? "\nDone." : "\nNothing changed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

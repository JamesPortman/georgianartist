/**
 * Add copyright metadata to images already sitting in Vercel Blob.
 *
 * Admin uploads only started carrying it when lib/image-copyright.ts landed;
 * anything uploaded before that is bare. This fetches each one, embeds the
 * same metadata, and writes it back.
 *
 * It writes to the **same pathname** with `allowOverwrite`, so the URL doesn't
 * change and the database is never touched. A fresh URL would mean a DB write
 * per product and a window where rows point at a blob that no longer exists —
 * not worth it to add metadata. The trade is that Blob's CDN may serve the old
 * bytes for a while, which for metadata is fine.
 *
 * Needs BLOB_READ_WRITE_TOKEN and DATABASE_URL. Default is a DRY RUN.
 *
 * Blob calls pass token: blobToken() — see scripts/blob-token.ts for why every
 * script has to.
 *
 *   npm run images:backfill-blob
 *   npm run images:backfill-blob -- --commit
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { put } from "@vercel/blob";
import { blobToken } from "./blob-token";
import { embedCopyright } from "../lib/image-copyright";
import { copyrightNotice } from "../lib/copyright";

const dbUrl = process.env.DATABASE_URL!;
const adapter = /neon\.tech/i.test(dbUrl)
  ? new PrismaNeonHttp(dbUrl, {})
  : new PrismaPg({ connectionString: dbUrl });
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({ adapter });

const isBlob = (u?: string | null): u is string =>
  !!u && u.includes(".blob.vercel-storage.com");

/** "https://xyz.public.blob.vercel-storage.com/inspiration/lora-bay-AbC123.jpg"
 *   -> "inspiration/lora-bay-AbC123.jpg" */
function pathnameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

async function main() {
  const commit = process.argv.includes("--commit");
  const token = blobToken();

  const products = await prisma.product.findMany({
    select: { id: true, image: true, inspirationImage: true },
    orderBy: { id: "asc" },
  });

  const targets: { id: string; kind: string; url: string }[] = [];
  for (const p of products) {
    if (isBlob(p.image)) targets.push({ id: p.id, kind: "image", url: p.image });
    if (isBlob(p.inspirationImage))
      targets.push({ id: p.id, kind: "inspiration", url: p.inspirationImage });
  }

  if (targets.length === 0) {
    console.log("\nNo Blob-hosted catalogue images. Nothing to do.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(
    `\n${targets.length} Blob-hosted image(s) across ${products.length} products.` +
    `\n  Notice: ${copyrightNotice()}` +
    (commit ? "\n" : "  DRY RUN — pass --commit to write.\n")
  );

  let tagged = 0, already = 0, failed = 0;

  for (const t of targets) {
    const label = `${t.id} (${t.kind})`.padEnd(40);
    try {
      const res = await fetch(t.url, { cache: "no-store" });
      if (!res.ok) {
        console.log(`  ✗  ${label} fetch ${res.status}`);
        failed++;
        continue;
      }
      const original = Buffer.from(await res.arrayBuffer());
      const embedded = embedCopyright(original);

      if (embedded.equals(original)) {
        // Either it's already tagged, or it isn't a JPEG we can parse. Both
        // mean "leave it alone" — embedCopyright never half-writes.
        console.log(`  ·  ${label} unchanged (already tagged, or not a readable JPEG)`);
        already++;
        continue;
      }

      console.log(
        `  →  ${label} ${original.length} → ${embedded.length} bytes` +
        ` (+${embedded.length - original.length})`
      );
      if (!commit) { tagged++; continue; }

      await put(pathnameOf(t.url), embedded, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,  // same pathname
        allowOverwrite: true,    // ...so the URL, and every DB row, still works
        token,
      });
      tagged++;
    } catch (e) {
      console.log(`  ✗  ${label} ${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }
  }

  console.log(
    `\n${commit ? "Tagged" : "Would tag"} ${tagged}; ${already} left as-is; ${failed} failed.\n`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

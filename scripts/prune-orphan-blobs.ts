/**
 * Delete blobs that nothing in the database points at any more.
 *
 * Most areas leave litter behind for the same reason: they re-upload under a
 * fresh URL rather than overwriting, so replacing a film or a photo strands its
 * predecessor in the store — same subject, older bytes, nothing referencing it.
 *
 *   films        making-of/    superseded by publish-films.ts (`replace: true`)
 *   inspiration  inspiration/  superseded by re-uploading in the admin
 *   reels        reels/        superseded by re-running queue-reels.ts
 *   paintings    paintings/    admin uploads no product points at any more
 *   photographs  photographs/  the same, for photographs
 *   homes        homes/        collectors' photos no product points at any more
 *
 * The areas and the rules for what counts as an orphan are in
 * lib/blob-prune.ts, with tests. Every run lists the whole store once and
 * reports any top-level folder no area covers, because that is how nine orphans
 * in paintings/ and photographs/ went unseen until September 2026.
 *
 * reels/ holds the source video for a queued Instagram reel — for a post that
 * has not published yet it is the only copy, so the reference check carries the
 * whole weight here. It is gated on age as well, because queue-reels.ts uploads
 * the blob, then waits on Claude for a caption, and only then writes the
 * InstagramPost row that references it. For those seconds the blob is a
 * genuine orphan by every test this script can apply; a day's grace is free,
 * since nothing here is urgent.
 *
 * igready/ is a third case that works differently. Those are letterboxed copies
 * made when a painting's aspect ratio falls outside what Instagram accepts.
 * Nothing in the database ever points at one — Meta fetches it while building
 * the media container and keeps its own copy — so "unreferenced" is true of
 * every one of them, including a copy uploaded seconds ago for a post that is
 * still publishing. Age is the only safe signal there, so that area is gated on
 * upload time instead: publishing takes under a minute, and a day's grace means
 * anything still sitting there has already been published or already failed.
 *
 * Publishing deletes its own copy on the way out (see discardPreparedImage), so
 * this sweeps up the pre-2026-09 backlog and anything stranded by a container
 * creation that threw after the upload.
 *
 * Run with:  npx tsx scripts/prune-orphan-blobs.ts <area>            (lists only)
 *            npx tsx scripts/prune-orphan-blobs.ts <area> --apply    (deletes)
 *            npx tsx scripts/prune-orphan-blobs.ts all
 *
 * NOTE the inverted default: the other scripts here write unless given
 * --dry-run. Deleting is not undoable, so this one reports unless given
 * --apply.
 *
 * Guards, because a wrong answer here destroys published media:
 *   - only ever considers blobs under the area's own prefix
 *   - refuses to delete anything if the database returns implausibly few rows,
 *     which is what a failed query or an empty table looks like
 *   - collects references from EVERY table that stores a URL, not just the one
 *     the area is "about" — an inspiration photo could equally be sitting in a
 *     queued Instagram post, and deleting it would break a scheduled publish
 *   - also counts a Blob URL written anywhere in the repository's tracked
 *     files, and every URL the seed data builds (evaluated, since
 *     data/making-of.ts assembles its URLs from a template), so a URL the
 *     source or a fresh seed depends on is never an orphan
 *   - never deletes a URL a row references, even an older-looking one
 *   - archives each blob to disk before deleting it, so a mistake is a copy
 *     back rather than a loss (--no-archive opts out)
 */

import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { list, del, get } from "@vercel/blob";
import { mediaPath, privateBlobToken } from "../lib/private-blob";
import { execFileSync } from "child_process";
import { blobToken } from "./blob-token";
import {
  AREAS,
  type AreaName,
  type BlobInfo,
  blobKey,
  blobUrlsIn,
  findOrphans,
  uncoveredFolders,
} from "../lib/blob-prune";
import { makingOfFilms } from "../data/making-of";
import { products as seedProducts } from "../data/products";
import { photographs as seedPhotographs } from "../data/photographs";

const APPLY = process.argv.includes("--apply");
const ARCHIVE = !process.argv.includes("--no-archive");

const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url)
    ? new PrismaNeonHttp(url, {})
    : new PrismaPg({ connectionString: url }),
});

const mb = (n: number) => `${(n / 1e6).toFixed(1)}MB`;

/**
 * A blob from either store. Private-store uploads are referenced by rows as
 * /media/<pathname> (lib/private-blob.ts), so that is the url they are matched
 * on; they are fetched and deleted by pathname with the private token.
 */
type StoreBlob = BlobInfo & { privateStore?: boolean };

/**
 * Every URL held anywhere in the database, with what holds it.
 *
 * Deliberately not scoped to the area being pruned. The prefix says where a
 * blob lives, not who uses it, and the cost of missing a reference is deleting
 * something live.
 */
async function collectReferences(): Promise<{ refs: Map<string, string[]>; counts: Record<string, number> }> {
  const [products, posts, films] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, image: true, inspirationImage: true, homePhoto: true, mockupImage: true },
    }),
    prisma.instagramPost.findMany({ select: { id: true, status: true, imageUrl: true } }),
    prisma.makingOf.findMany({ select: { id: true, videoUrl: true, posterUrl: true } }),
  ]);

  const refs = new Map<string, string[]>();
  const add = (u: string | null | undefined, who: string) => {
    if (!u) return;
    const key = blobKey(u);
    refs.set(key, [...(refs.get(key) ?? []), who]);
  };

  for (const p of products) {
    add(p.image, `Product.image:${p.id}`);
    add(p.inspirationImage, `Product.inspirationImage:${p.id}`);
    add(p.homePhoto, `Product.homePhoto:${p.id}`);
    add(p.mockupImage, `Product.mockupImage:${p.id}`);
  }
  for (const p of posts) add(p.imageUrl, `InstagramPost(${p.status}):${p.id.slice(0, 8)}`);
  for (const f of films) {
    add(f.videoUrl, `MakingOf.video:${f.id}`);
    add(f.posterUrl, `MakingOf.poster:${f.id}`);
  }

  // The repository counts too: a Blob URL typed into a page or a data file is
  // as live as one in a row. Tracked text files only; images can't hold one.
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  let repoRefs = 0;
  for (const file of tracked) {
    if (!/\.(ts|tsx|js|mjs|cjs|json|md|css|html|txt|yml|yaml)$/i.test(file)) continue;
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // deleted in the working tree
    }
    for (const u of blobUrlsIn(text)) {
      add(u, `repo:${file}`);
      repoRefs++;
    }
  }

  // The seed data counts as well, evaluated rather than read as text:
  // data/making-of.ts builds its URLs from a base and a file name, which no
  // text scan can see. On 29 Sep 2026 that let this script delete four films
  // the seed still named, so CI seeded rows pointing at 404s.
  const seeds: [string, unknown][] = [
    ["data/making-of.ts", makingOfFilms],
    ["data/products.ts", seedProducts],
    ["data/photographs.ts", seedPhotographs],
  ];
  for (const [file, rows] of seeds) {
    for (const u of blobUrlsIn(JSON.stringify(rows))) {
      add(u, `seed:${file}`);
      repoRefs++;
    }
  }

  return {
    refs,
    counts: { products: products.length, instagramPosts: posts.length, films: films.length, repoRefs },
  };
}

/**
 * A failed read looks exactly like an empty table, and an empty table would
 * make every blob in the store an orphan. Well below the real counts means
 * something is wrong — stop rather than delete the catalogue.
 */
const FLOORS = { products: 30, films: 15, instagramPosts: 10 };

async function pruneArea(area: AreaName, store: StoreBlob[], refs: Map<string, string[]>) {
  const { prefix, what, minAgeHours } = AREAS[area];
  console.log(
    `\n── ${area} (${prefix}) — ${what}` +
    (minAgeHours ? `, older than ${minAgeHours}h` : "") +
    " ──"
  );

  const blobs = store.filter((b) => b.pathname.startsWith(prefix));
  const orphans = findOrphans(blobs, AREAS[area], refs) as StoreBlob[];
  const bytes = orphans.reduce((n, b) => n + b.size, 0);

  const skipped = blobs.length - orphans.length;
  console.log(
    `${blobs.length} blob(s) under ${prefix}, ${orphans.length} to remove` +
    (skipped ? ` (${skipped} referenced or too recent)` : "") +
    "\n"
  );
  for (const b of orphans.sort((a, z) => z.size - a.size)) {
    console.log(
      `   ${APPLY ? "delete" : "would delete"}  ${b.pathname.padEnd(60)} ` +
      `${mb(b.size).padStart(8)}  uploaded ${new Date(b.uploadedAt).toISOString().slice(0, 10)}`
    );
  }
  if (!orphans.length) {
    console.log("   nothing to prune");
    return 0;
  }
  console.log(`\n${APPLY ? "reclaiming" : "would reclaim"} ${mb(bytes)}`);

  if (!APPLY) {
    console.log("Nothing was deleted. Re-run with --apply to remove them.");
    return 0;
  }

  let archiveDir = "";
  if (ARCHIVE) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    archiveDir = path.join(".blob-archive", `${stamp}-${area}`);
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  // One at a time, so a failure halfway leaves a clear picture of what went.
  for (const b of orphans) {
    const token = b.privateStore ? privateBlobToken()! : blobToken();
    if (ARCHIVE) {
      let bytes: Buffer | null = null;
      if (b.privateStore) {
        const file = await get(b.pathname, { access: "private", token, useCache: false });
        if (file?.statusCode === 200) bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
      } else {
        const res = await fetch(b.url, { cache: "no-store" });
        if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
      }
      if (!bytes) {
        console.log(`   SKIPPED  ${b.pathname} — could not archive; not deleting`);
        continue;
      }
      fs.writeFileSync(path.join(archiveDir, `${b.privateStore ? "private-" : ""}${path.basename(b.pathname)}`), bytes);
    }
    await del(b.privateStore ? b.pathname : b.url, { token });
    console.log(`   deleted  ${b.privateStore ? "private " : ""}${b.pathname}`);
  }
  if (ARCHIVE) console.log(`\nArchived copies: ${archiveDir}`);
  console.log(`Done — ${orphans.length} blob(s) removed, ${mb(bytes)} reclaimed.`);
  return orphans.length;
}

async function main() {
  const requested = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const areas: AreaName[] =
    requested.length === 0 || requested[0] === "all"
      ? (Object.keys(AREAS) as AreaName[])
      : (requested as AreaName[]);

  for (const a of areas) {
    if (!AREAS[a]) {
      console.error(`Unknown area "${a}". Expected one of: ${Object.keys(AREAS).join(", ")}, all`);
      process.exit(1);
    }
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN is not set — check .env.local. Nothing done.");
    process.exit(1);
  }

  const { refs, counts } = await collectReferences();
  for (const [table, floor] of Object.entries(FLOORS)) {
    if ((counts[table] ?? 0) < floor) {
      console.error(
        `Only ${counts[table]} ${table} rows came back (expected at least ${floor}). ` +
          `That looks like a failed read, not an empty store. Refusing to delete anything.`
      );
      process.exit(1);
    }
  }
  console.log(
    `${counts.products} products, ${counts.films} films, ${counts.instagramPosts} instagram posts, ` +
    `${counts.repoRefs} URL(s) in the repo → ${refs.size} referenced URLs`
  );

  const store: StoreBlob[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ cursor, limit: 1000, token: blobToken() });
    store.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  console.log(`${store.length} blob(s) in the public store`);

  // The private store, when there is one: admin uploads, matched as /media paths.
  const privateToken = privateBlobToken();
  if (privateToken) {
    let n = 0;
    cursor = undefined;
    do {
      const page: Awaited<ReturnType<typeof list>> = await list({ cursor, limit: 1000, token: privateToken });
      for (const b of page.blobs) {
        store.push({ ...b, url: mediaPath(b.pathname), privateStore: true });
        n++;
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    console.log(`${n} blob(s) in the private store`);
  }

  const gaps = uncoveredFolders(store.map((b) => b.pathname));
  if (gaps.size) {
    console.log("\nNot covered by any area, so never checked (add an area in lib/blob-prune.ts):");
    for (const [folder, n] of gaps) console.log(`   ${folder.padEnd(24)} ${n} blob(s)`);
  }

  let total = 0;
  for (const a of areas) total += await pruneArea(a, store, refs);
  if (APPLY) console.log(`\n${total} blob(s) removed in total.`);
}

main().finally(() => prisma.$disconnect());

/**
 * Baseline `mediaFingerprint` on queued Instagram posts that don't have one.
 *
 * The publish guard compares the fingerprint recorded when a caption was
 * written against the live one, and refuses to publish on a confident
 * mismatch. A null baseline is deliberately read as "allow" — refusing to
 * publish because we never took a reading would be worse than the problem
 * being guarded against — but it does mean rows queued before the column
 * existed are unguarded. This baselines them.
 *
 * It records what the media looks like NOW, which is only correct if the
 * caption still matches the artwork. Read the captions first; anything stale
 * should be regenerated (which baselines it anyway), not backfilled.
 *
 * Needs DATABASE_URL only — no ANTHROPIC_API_KEY, so it runs locally.
 *
 * Default is a DRY RUN.
 *
 *   npx tsx scripts/instagram/backfill-fingerprints.ts
 *   npx tsx scripts/instagram/backfill-fingerprints.ts --commit
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { fetchMediaFingerprint } from "../../lib/instagram";

const dbUrl = process.env.DATABASE_URL!;
const adapter = /neon\.tech/i.test(dbUrl)
  ? new PrismaNeonHttp(dbUrl, {})
  : new PrismaPg({ connectionString: dbUrl });
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({ adapter });

async function main() {
  const commit = process.argv.includes("--commit");

  // Only rows that can still be published. A posted row's fingerprint would
  // be a fiction — the guard never runs on it again.
  const rows = await prisma.instagramPost.findMany({
    where: { status: { in: ["pending", "approved"] }, mediaFingerprint: null },
    select: { id: true, type: true, productId: true, imageUrl: true, scheduledAt: true },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  if (rows.length === 0) {
    console.log("\nEvery queued post already has a fingerprint. Nothing to do.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(
    `\n${rows.length} queued post(s) without a fingerprint.` +
    (commit ? "\n" : "  DRY RUN — pass --commit to write.\n")
  );

  let done = 0, unreadable = 0;

  for (const row of rows) {
    const label = `${row.type.padEnd(11)} ${(row.productId ?? "(no product)").padEnd(28)}`;
    const fingerprint = await fetchMediaFingerprint(row.imageUrl);

    if (!fingerprint) {
      // Not a failure — the guard simply keeps letting this one through.
      console.log(`  ·  ${label} media serves no etag or length; leaving unguarded`);
      unreadable++;
      continue;
    }

    console.log(`  →  ${label} ${fingerprint}`);
    if (!commit) { done++; continue; }

    await prisma.instagramPost.update({
      where: { id: row.id },
      data: { mediaFingerprint: fingerprint },
    });
    done++;
  }

  console.log(
    `\n${commit ? "Baselined" : "Would baseline"} ${done}; ${unreadable} left unguarded.\n`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

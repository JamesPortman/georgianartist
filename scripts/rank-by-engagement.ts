/**
 * Reorder the gallery's "Featured" view by engagement (lib/engagement-rank.ts).
 *
 *   npm run catalogue:rank-by-engagement              # dry run: prints the new order
 *   npm run catalogue:rank-by-engagement -- --commit  # archives the old order, then writes
 *
 * Paintings and photographs are ranked separately, over every analytics event
 * ever recorded. The current order is archived to .blob-archive/sort-order
 * first, and each row is only updated if its position hasn't changed since it
 * was read — so an admin drag-reorder mid-run stops the script rather than
 * being overwritten. Drag-to-reorder in the admin still works afterwards.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { writeArchive } from "./archive-file";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { engagementScore, rankByEngagement, type EngagementRow } from "../lib/engagement-rank";

const dbUrl = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(dbUrl)
    ? new PrismaNeonHttp(dbUrl, {})
    : new PrismaPg({ connectionString: dbUrl }),
});

type Row = EngagementRow & { type: string; title: string };

async function main() {
  const commit = process.argv.includes("--commit");

  // Page views carry the work in their path; actions carry productId.
  const rows = await prisma.$queryRaw<Row[]>`
    WITH ev AS (
      SELECT "visitorId", kind, action,
        COALESCE("productId", substring(path from '^/(?:products|photographs)/([^/?#]+)')) AS pid
      FROM "AnalyticsEvent")
    SELECT p.id, p.type, p.title, p."soldOut", p."sortOrder",
      count(DISTINCT ev."visitorId") FILTER (WHERE ev.kind = 'pageview')::int AS viewers,
      count(DISTINCT ev."visitorId") FILTER (WHERE ev.action = 'product_click')::int AS clickers,
      count(DISTINCT ev."visitorId") FILTER (WHERE ev.action = 'buy_open')::int AS "buyOpeners",
      count(DISTINCT ev."visitorId") FILTER (WHERE ev.action = 'buy_submit')::int AS buyers
    FROM "Product" p LEFT JOIN ev ON ev.pid = p.id
    GROUP BY p.id`;

  const changes: { row: Row; next: number }[] = [];
  for (const type of ["painting", "photograph"]) {
    const group = rows.filter((r) => r.type === type);
    const byId = new Map(group.map((r) => [r.id, r]));
    console.log(`\n${type}s`);
    rankByEngagement(group).forEach((id, next) => {
      const r = byId.get(id)!;
      console.log(
        `  ${String(next + 1).padStart(2)}. ${r.title}${r.soldOut ? " (sold out)" : ""}` +
          `  score ${engagementScore(r)}, ${r.viewers} viewers, was ${r.sortOrder + 1}`
      );
      if (next !== r.sortOrder) changes.push({ row: r, next });
    });
  }

  console.log(`\n${changes.length} of ${rows.length} works would move.`);
  if (!commit || changes.length === 0) {
    if (!commit) console.log("Dry run. Pass --commit to write.\n");
    return;
  }

  const file = writeArchive(
    ".blob-archive/sort-order",
    "sort-order",
    rows.map(({ id, type, title, sortOrder }) => ({ id, type, title, sortOrder }))
  );
  console.log(`archived the current order to ${file}`);

  let done = 0;
  for (const { row, next } of changes) {
    // One statement per row: the Neon HTTP adapter has no transactions.
    const n = await prisma.$executeRaw`
      UPDATE "Product" SET "sortOrder" = ${next}
      WHERE id = ${row.id} AND "sortOrder" = ${row.sortOrder}`;
    if (n !== 1) throw new Error(`"${row.id}" moved since it was read; stopped after ${done} updates`);
    done++;
  }
  console.log(`moved ${done} works.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

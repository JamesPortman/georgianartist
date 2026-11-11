/**
 * Delete analytics events belonging to excluded browsers.
 *
 * Excluding a browser stops NEW events at the ingest route; the ones already
 * recorded stay until this removes them. They're deleted rather than filtered
 * in the dashboard because the dashboard runs a dozen-odd queries, several of
 * them raw SQL, and a filter every one of them has to remember is a trap — the
 * next query added silently counts the owner again.
 *
 * Events are written to a JSON archive first, so this is recoverable.
 *
 *   npm run analytics:purge-excluded
 *   npm run analytics:purge-excluded -- --commit
 *
 * Default is a DRY RUN.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { writeArchive } from "./archive-file";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const dbUrl = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(dbUrl)
    ? new PrismaNeonHttp(dbUrl, {})
    : new PrismaPg({ connectionString: dbUrl }),
});

async function main() {
  const commit = process.argv.includes("--commit");

  const excluded = await prisma.excludedVisitor.findMany({ orderBy: { createdAt: "asc" } });
  if (excluded.length === 0) {
    console.log("\nNo excluded browsers. Nothing to purge.\n");
    return;
  }

  const ids = excluded.map((e) => e.visitorId);
  const events = await prisma.analyticsEvent.findMany({
    where: { visitorId: { in: ids } },
    orderBy: { createdAt: "asc" },
  });

  const total = await prisma.analyticsEvent.count();
  console.log(
    `\n${excluded.length} excluded browser(s), ${events.length} of ${total} events ` +
    `(${((events.length / Math.max(total, 1)) * 100).toFixed(0)}%)` +
    (commit ? "\n" : "  DRY RUN — pass --commit to delete.\n")
  );

  for (const e of excluded) {
    const mine = events.filter((x) => x.visitorId === e.visitorId);
    const cities = [...new Set(mine.map((x) => x.city ?? "—"))];
    console.log(
      `  ${e.visitorId.slice(0, 8)}…  ${String(mine.length).padStart(5)} events  ` +
      `${(e.label ?? "(no label)").padEnd(24)} seen from: ${cities.join(", ") || "—"}`
    );
  }

  if (events.length === 0) {
    console.log("\nNothing to delete — already purged.\n");
    return;
  }
  if (!commit) {
    console.log("\nNothing was deleted. Re-run with --commit.\n");
    return;
  }

  // Throws rather than overwrite an earlier archive, and nothing is deleted
  // unless this succeeds.
  const file = writeArchive(".blob-archive/deleted-rows", "analytics-excluded", events);
  console.log(`\narchived ${events.length} event(s) to ${file}`);

  // One statement. Batch ops need a transaction over the Neon HTTP adapter, but
  // a single deleteMany is safe — same reason the analytics prune cron uses one.
  const { count } = await prisma.analyticsEvent.deleteMany({
    where: { visitorId: { in: ids } },
  });
  console.log(`deleted ${count} event(s); ${await prisma.analyticsEvent.count()} remain.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

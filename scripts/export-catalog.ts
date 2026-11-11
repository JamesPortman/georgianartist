/**
 * Manual catalogue snapshot, in the same format as the cron's (lib/backup.ts),
 * written to backups/catalog-<date>T<hh-mm>.json on this machine (gitignored).
 *
 *   npm run db:export
 *
 * Restorable with `npm run backup:drill -- --file <that file>`.
 * (The Vercel cron at /api/cron/backup takes one every six hours.)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";
import { buildSnapshot } from "../lib/backup";

const url = process.env.DATABASE_URL!;
assertDatabaseAllowed(); // off Vercel, only a local or named database (lib/db-guard.ts)
const prisma = new PrismaClient({
  adapter: /neon\.tech/i.test(url) ? new PrismaNeonHttp(url, {}) : new PrismaPg({ connectionString: url }),
});

async function main() {
  const snapshot = await buildSnapshot(prisma);
  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = snapshot.exportedAt.slice(0, 16).replace(":", "-");
  const file = path.join(dir, `catalog-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  console.log(`Exported ${snapshot.count} products (and films, Instagram queue, exclusions, old slugs) → ${file}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

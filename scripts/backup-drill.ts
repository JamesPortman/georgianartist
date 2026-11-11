/**
 * Restore drill: prove a snapshot actually restores.
 *
 * A backup nobody has restored is a hope. This takes a snapshot, restores it
 * into an EMPTY throwaway database, reads that database back as a snapshot,
 * and fails unless every table matches row for row (lib/backup.ts
 * fingerprint). It also prints how long the restore took, which is most of
 * the answer to "how long would we be down?".
 *
 *   npm run backup:drill                     # newest snapshot in the private store
 *   npm run backup:drill -- --file <path>    # a snapshot on disk
 *   npm run backup:drill -- --from-db        # snapshot DATABASE_URL now (CI)
 *
 * DRILL_DATABASE_URL names the target. It must be empty, it must pass the same
 * guard as everything else (local, or its host named in DATABASE_ALLOW_HOST,
 * e.g. a Neon branch made for the drill), and it must not be DATABASE_URL.
 * The schema is pushed to it first. Nothing is ever written to the source.
 *
 * CI runs it with --from-db on every pull request (.github/workflows/e2e.yml),
 * so a change that breaks restoring fails before it ships; run the real thing
 * against the newest production snapshot monthly (RUNBOOK.md).
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { list, get } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";
import { assertDatabaseAllowed } from "../lib/db-guard";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildSnapshot, fingerprint, restoreSnapshot, TABLES, type Snapshot } from "../lib/backup";
import { privateBlobToken, PRIVATE_TOKEN_ENV } from "../lib/private-blob";

/** A client for this URL, after the same guard everything else passes. */
function clientFor(url: string) {
  assertDatabaseAllowed({ ...process.env, DATABASE_URL: url }); // off Vercel, only a local or named database (lib/db-guard.ts)
  return new PrismaClient({
    adapter: /neon\.tech/i.test(url) ? new PrismaNeonHttp(url, {}) : new PrismaPg({ connectionString: url }),
  });
}

async function newestPrivateSnapshot(): Promise<{ name: string; snapshot: Snapshot }> {
  const token = privateBlobToken();
  if (!token) throw new Error(`${PRIVATE_TOKEN_ENV} is not set, so there is no private store to read.`);
  const all: { pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page: Awaited<ReturnType<typeof list>> = await list({ prefix: "backups/catalog-", cursor, limit: 1000, token });
    all.push(...page.blobs);
    cursor = page.cursor;
  } while (cursor);
  const newest = all.map((b) => b.pathname).sort().at(-1);
  if (!newest) throw new Error("The private store holds no snapshots yet.");
  const file = await get(newest, { access: "private", token, useCache: false });
  if (!file || file.statusCode !== 200) throw new Error(`Could not read ${newest}`);
  return { name: newest, snapshot: JSON.parse(await new Response(file.stream).text()) };
}

async function main() {
  const argv = process.argv.slice(2);
  const target = process.env.DRILL_DATABASE_URL;
  if (!target) throw new Error("Set DRILL_DATABASE_URL to an empty throwaway database.");
  if (target === process.env.DATABASE_URL) throw new Error("DRILL_DATABASE_URL must not be DATABASE_URL.");
  // The target is what gets written: guarded before the schema push touches it.
  assertDatabaseAllowed({ ...process.env, DATABASE_URL: target });

  // ── The snapshot ──
  let name: string;
  let snapshot: Snapshot;
  if (argv.includes("--file")) {
    const file = argv[argv.indexOf("--file") + 1];
    if (!file) {
      console.error("--file needs the path of a snapshot.");
      process.exit(2);
    }
    name = file;
    snapshot = JSON.parse(fs.readFileSync(name, "utf8"));
  } else if (argv.includes("--from-db")) {
    const src = clientFor(process.env.DATABASE_URL!);
    snapshot = JSON.parse(JSON.stringify(await buildSnapshot(src)));
    await src.$disconnect();
    name = "DATABASE_URL, just now";
  } else {
    ({ name, snapshot } = await newestPrivateSnapshot());
  }
  console.log(`\nSnapshot: ${name} (exported ${snapshot.exportedAt}, format v${snapshot.version ?? 1})`);

  // ── An empty target with the current schema ──
  execFileSync("npx", ["prisma", "db", "push"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: target } });
  const db = clientFor(target);
  try {
    if ((await db.product.count()) > 0) {
      throw new Error("DRILL_DATABASE_URL already holds products. A drill restores into an empty database only.");
    }

    const started = Date.now();
    const counts = await restoreSnapshot(db, snapshot);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    // ── Read it back and compare ──
    const expected = fingerprint(snapshot);
    const actual = fingerprint(JSON.parse(JSON.stringify(await buildSnapshot(db))));
    console.log(`\nRestored in ${seconds}s:`);
    let ok = true;
    for (const t of TABLES) {
      const same = expected[t].rows === actual[t].rows && expected[t].sha256 === actual[t].sha256;
      ok &&= same;
      console.log(
        `  ${same ? "ok  " : "DIFF"} ${t.padEnd(18)} ${String(counts[t]).padStart(4)} inserted, ` +
          `${actual[t].rows} read back${same ? "" : ` (expected ${expected[t].rows}, contents differ)`}`
      );
    }
    if (!ok) {
      console.error("\nDRILL FAILED: the restored database does not match the snapshot.\n");
      process.exitCode = 1;
    } else {
      console.log(`\nDrill passed: every table matches the snapshot, row for row.\n`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});

/**
 * Run mutation testing module by module, then merge the reports.
 *
 *   npm run test:mutation                                  # every module in MODULES
 *   STRYKER_MUTATE=lib/order.ts,lib/backup.ts npm run test:mutation
 *
 * One Stryker run per module, so each mutant is tested against only the tests
 * related to its own module (stryker.config.mjs), not those of every module:
 * a mutant in lib/legacy-urls.ts never waits on the twenty-odd test files that
 * reach lib/db-guard.ts. Each run writes reports/mutation/<module>.json and
 * .html; this merges the JSON into reports/mutation/mutation.json for
 * scripts/mutation-check.mjs, and writes an index linking the HTML reports.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** One report from many: each module's files, under the first report's metadata. */
export function mergeReports(reports) {
  if (!reports.length) throw new Error("No reports to merge.");
  return { ...reports[0], files: Object.assign({}, ...reports.map((r) => r.files)) };
}

async function main() {
  const config = await import(pathToFileURL(path.resolve("stryker.config.mjs")).href);
  const { MODULES, slug } = config;
  const named = (process.env.STRYKER_MUTATE ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const modules = named.length ? named : Object.keys(MODULES);
  const dir = path.join("reports", "mutation");
  fs.rmSync(dir, { recursive: true, force: true });

  const failed = [];
  for (const [i, module] of modules.entries()) {
    console.log(`\n── ${i + 1}/${modules.length} ${module} ──`);
    const run = spawnSync("npx", ["stryker", "run", "--concurrency", String(os.availableParallelism())], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "test", STRYKER_MUTATE: module },
    });
    if (run.status !== 0) failed.push(module);
  }

  const reports = modules
    .map((m) => path.join(dir, `${slug(m)}.json`))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  if (reports.length) {
    fs.writeFileSync(path.join(dir, "mutation.json"), JSON.stringify(mergeReports(reports)));
    const links = modules
      .filter((m) => fs.existsSync(path.join(dir, `${slug(m)}.html`)))
      .map((m) => `<li><a href="${slug(m)}.html">${m}</a></li>`)
      .join("\n");
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<!doctype html><meta charset="utf-8"><title>Mutation reports</title><h1>Mutation reports</h1><ul>\n${links}\n</ul>\n`
    );
  }
  if (failed.length) {
    console.error(`\nStryker failed for: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

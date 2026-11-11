/**
 * Which mutated modules (stryker.config.mjs MODULES) a pull request touches,
 * so its mutation run covers those and no more.
 *
 *   node scripts/mutation-scope.mjs <base-ref>     # prints "lib/order.ts,lib/backup.ts" or ""
 *
 * A module is in scope when the PR changes it, or changes a test that
 * `vitest related` runs for it. Changing the mutation setup itself, the test
 * setup or the dependencies puts every module in scope. A change to code a
 * module only imports (a price table, say) does not; the weekly full run
 * covers that.
 *
 * In GitHub Actions the result is also written to $GITHUB_OUTPUT as `modules`.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Files whose change can move every module's score. */
export const SETUP_FILES = [
  "stryker.config.mjs",
  "scripts/mutation-scope.mjs",
  "scripts/mutation-check.mjs",
  "scripts/mutation-run.mjs",
  ".github/workflows/mutation.yml",
  "vitest.config.mts",
  "vitest.setup.ts",
  "package-lock.json",
];

/**
 * @param {string[]} changed  files the PR changes
 * @param {string[]} modules  every mutated module
 * @param {(module: string) => string[]} testsFor  test files `vitest related` runs for a module
 */
export function scopeFor(changed, modules, testsFor) {
  if (changed.some((f) => SETUP_FILES.includes(f))) return [...modules];
  const tests = new Set(changed.filter((f) => f.startsWith("__tests__/")));
  return modules.filter((m) => changed.includes(m) || (tests.size > 0 && testsFor(m).some((t) => tests.has(t))));
}

/** The test files `vitest related` runs for one module, found by running them. */
function relatedTests(module) {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "related-")), "r.json");
  try {
    execFileSync(
      "npx",
      ["vitest", "related", "--run", "--passWithNoTests", "--reporter=json", `--outputFile=${out}`, module],
      { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_ENV: "test" } }
    );
  } catch {
    // A failing test still writes the report; the mutation run will fail on it anyway.
  }
  if (!fs.existsSync(out)) return [];
  const report = JSON.parse(fs.readFileSync(out, "utf8"));
  return report.testResults.map((r) => path.relative(process.cwd(), r.name).split(path.sep).join("/"));
}

async function main() {
  const base = process.argv[2];
  if (!base) throw new Error("usage: node scripts/mutation-scope.mjs <base-ref>");
  const { MODULES } = await import(pathToFileURL(path.resolve("stryker.config.mjs")).href);
  const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const scope = scopeFor(changed, Object.keys(MODULES), relatedTests);
  console.log(scope.join(","));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `modules=${scope.join(",")}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

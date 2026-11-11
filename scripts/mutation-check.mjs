/**
 * Pass or fail a mutation run, module by module.
 *
 *   node scripts/mutation-check.mjs [reports/mutation/mutation.json]
 *
 * Each module's score (killed ÷ killed + survived + untested; a timeout counts
 * as killed) is compared with its floor in stryker.config.mjs MODULES, and the
 * run fails if any module is below it. A pull request that adds code its tests
 * don't pin, or weakens a test, lowers the score of the module it touched.
 *
 * Writes the table to $GITHUB_STEP_SUMMARY in GitHub Actions, and to stdout.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const KILLED = ["Killed", "Timeout"];
const MISSED = ["Survived", "NoCoverage"];

/**
 * @param {{ files: Record<string, { mutants: { status: string }[] }> }} report  Stryker's JSON report
 * @param {Record<string, { floor: number }>} modules
 */
export function checkScores(report, modules) {
  const rows = Object.entries(report.files).map(([file, { mutants }]) => {
    const killed = mutants.filter((m) => KILLED.includes(m.status)).length;
    const total = killed + mutants.filter((m) => MISSED.includes(m.status)).length;
    const score = total ? (100 * killed) / total : null;
    const floor = modules[file]?.floor ?? null;
    const below = score !== null && floor !== null && score < floor;
    return { file, killed, total, score, floor, below };
  });
  const errors = mutantErrors(report);
  return { rows, ok: !rows.some((r) => r.below) && errors === 0, errors };
}

/** Mutants Stryker couldn't run (CompileError, RuntimeError): a broken run, not a score. */
function mutantErrors(report) {
  return Object.values(report.files)
    .flatMap((f) => f.mutants)
    .filter((m) => m.status.endsWith("Error")).length;
}

export function summary({ rows, ok, errors }) {
  const pct = (n) => (n === null ? "n/a" : `${n.toFixed(1)}%`);
  const lines = [
    "## Mutation score",
    "",
    "| Module | Killed | Mutants | Score | Floor | |",
    "|---|---:|---:|---:|---:|---|",
    ...rows.map(
      (r) =>
        `| ${r.file} | ${r.killed} | ${r.total} | ${pct(r.score)} | ${r.floor === null ? "none" : `${r.floor}%`} | ${
          r.below ? "❌ below floor" : r.score !== null && r.floor !== null && r.score >= r.floor + 5 ? "↑ raise the floor?" : "✅"
        } |`
    ),
    "",
  ];
  if (errors) lines.push(`❌ ${errors} mutant(s) could not run (compile or runtime error); see the report.`, "");
  lines.push(
    ok
      ? "Every module is at or above its floor."
      : "A module is below its floor: a surviving mutant is a change no test notices. Open the report artifact, " +
          "find the survivors, and add or tighten the tests that should catch them. Don't lower the floor."
  );
  return lines.join("\n") + "\n";
}

async function main() {
  const file = process.argv[2] ?? "reports/mutation/mutation.json";
  if (!fs.existsSync(file)) throw new Error(`No report at ${file}; did Stryker run?`);
  const { MODULES } = await import(pathToFileURL(path.resolve("stryker.config.mjs")).href);
  const result = checkScores(JSON.parse(fs.readFileSync(file, "utf8")), MODULES);
  const text = summary(result);
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

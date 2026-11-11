/**
 * Writes a Markdown table of a Lighthouse CI run (lighthouserc.json) to stdout:
 * one row per page, from the median run, with the numbers the budget checks.
 * .github/workflows/perf.yml appends it to the job summary, so a PR shows
 * where each page stands against its limit, pass or fail.
 *
 *   node scripts/lhci-summary.mjs [lhci-reports]
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? "lhci-reports";
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
// Limits are per page (assertMatrix): the gallery gets a wider margin than the rest.
const matrix = JSON.parse(fs.readFileSync("lighthouserc.json", "utf8")).ci.assert.assertMatrix;
const limitsFor = (url) => {
  const entry = matrix.find((m) => new RegExp(m.matchingUrlPattern).test(url));
  return (id, key) => entry?.assertions[id]?.[1]?.[key];
};

const ms = (v) => `${Math.round(v).toLocaleString("en-CA")} ms`;
const kb = (v) => `${Math.round(v / 1024).toLocaleString("en-CA")} KB`;

const rows = manifest
  .filter((m) => m.isRepresentativeRun)
  .map((m) => {
    const lhr = JSON.parse(fs.readFileSync(m.jsonPath, "utf8"));
    const a = lhr.audits;
    const limit = limitsFor(m.url);
    const script = a["resource-summary"]?.details?.items?.find((i) => i.resourceType === "script")?.transferSize ?? 0;
    return [
      new URL(m.url).pathname,
      `${Math.round(lhr.categories.performance.score * 100)} (≥ ${Math.round(limit("categories:performance", "minScore") * 100)})`,
      `${ms(a["largest-contentful-paint"].numericValue)} (≤ ${ms(limit("largest-contentful-paint", "maxNumericValue"))})`,
      `${a["cumulative-layout-shift"].numericValue.toFixed(3)} (≤ ${limit("cumulative-layout-shift", "maxNumericValue")})`,
      `${ms(a["total-blocking-time"].numericValue)} (≤ ${ms(limit("total-blocking-time", "maxNumericValue"))})`,
      `${kb(script)} (≤ ${kb(limit("resource-summary:script:size", "maxNumericValue"))})`,
    ];
  });

const head = ["Page", "Performance", "LCP", "CLS", "TBT", "JavaScript"];
console.log("## Lighthouse (simulated phone, median of 5 runs)\n");
console.log(`| ${head.join(" | ")} |`);
console.log(`|${head.map(() => " --- ").join("|")}|`);
for (const r of rows) console.log(`| ${r.join(" | ")} |`);

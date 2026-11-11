/**
 * Pass or fail a ZAP scan from ZAP's own summary, minus one quirk.
 *
 *   node scripts/zap-gate.mjs zap/zap-output.txt
 *
 * The input is what zap-baseline.py / zap-full-scan.py / zap-api-scan.py
 * print: one "WARN-NEW: <name> [<id>] x <count>" line per rule that fired,
 * and a closing "FAIL-NEW: 0 FAIL-INPROG: 0 WARN-NEW: 1 ..." total. ZAP's
 * judgement of what counts (rules.tsv levels, OUTOFSCOPE, which risks it
 * reports at all) is kept exactly; the gate only refuses to fail on a line
 * whose count is 0. That is the quirk: when every instance of a rule matched
 * an OUTOFSCOPE line, the scripts still list the rule as a warning, with
 * nothing in it, and exit 2. It failed every push to main from 15 Oct 2026,
 * unseen for four weeks, whenever the spider reached a trailing-slash
 * redirect.
 *
 * Writes the result to $GITHUB_STEP_SUMMARY in GitHub Actions, and to stdout.
 */

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const FINDING = /^(WARN|FAIL)-(NEW|INPROG): (.+) \[(\d+)\] x (\d+)/;
const TOTALS = /^FAIL-NEW: \d+\s+FAIL-INPROG: \d+\s+WARN-NEW: \d+/m;

/**
 * The rules ZAP failed the scan on that still have instances.
 * @param {string} output  ZAP's console output
 * @returns {{ ok: boolean, complete: boolean, findings: { level: string, name: string, id: string, count: number }[], ignored: string[] }}
 */
export function judge(output) {
  const findings = [];
  const ignored = [];
  for (const line of output.split("\n")) {
    const m = line.trim().match(FINDING);
    if (!m) continue;
    const count = Number(m[5]);
    if (count > 0) findings.push({ level: m[1], name: m[3], id: m[4], count });
    else ignored.push(`${m[3]} [${m[4]}]`);
  }
  // No totals line means ZAP never finished its report: never a pass.
  const complete = TOTALS.test(output);
  return { ok: complete && findings.length === 0, complete, findings, ignored };
}

/** @param {ReturnType<typeof judge>} result */
export function summary(result) {
  if (!result.complete) return "ZAP gate: ZAP's summary is missing; the scan did not finish.\n";
  const ignored = result.ignored.length
    ? `\nIgnored, every instance out of scope (rules.tsv OUTOFSCOPE): ${result.ignored.join(", ")}.\n`
    : "";
  if (result.ok) return `ZAP gate: no untriaged findings.\n${ignored}`;
  const lines = result.findings.map((f) => `- ${f.level}: **${f.name}** [${f.id}] x ${f.count}`);
  return (
    `ZAP gate: ${lines.length} untriaged finding${lines.length === 1 ? "" : "s"}. ` +
    "Fix each one, or triage it in .zap/rules.tsv with the reason.\n\n" +
    lines.join("\n") + "\n" + ignored
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [outputPath] = process.argv.slice(2);
  const output = outputPath && fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  const result = judge(output);
  const text = summary(result);
  process.stdout.write(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${text}`);
  process.exit(result.ok ? 0 : 1);
}

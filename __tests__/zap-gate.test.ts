import { describe, it, expect } from "vitest";
import { judge, summary } from "../scripts/zap-gate.mjs";

/**
 * Both ZAP workflows pass or fail on scripts/zap-gate.mjs rather than ZAP's
 * exit code, so a bug here either hides a finding or turns main red for
 * nothing; the second is what happened for four weeks from 15 Oct 2026.
 * The lines below are ZAP's real output format.
 */

const totals = (warn: number) =>
  `FAIL-NEW: 0\tFAIL-INPROG: 0\tWARN-NEW: ${warn}\tWARN-INPROG: 0\tINFO: 5\tIGNORE: 0\tPASS: 62`;

// main's failure, verbatim apart from the timestamps.
const QUIRK = [
  "Total of 1575 URLs",
  "PASS: Vulnerable JS Library (Powered by Retire.js) [10003]",
  "INFO-NEW: Non-Storable Content [10049] x 7 Informational. Pages are no-store on purpose.",
  "WARN-NEW: Content-Type Header Missing [10019] x 0 ",
  totals(1),
].join("\n");

describe("judge", () => {
  it("passes main's four-week failure: a warning with no instances", () => {
    const result = judge(QUIRK);
    expect(result).toMatchObject({ ok: true, complete: true, findings: [] });
    expect(result.ignored).toEqual(["Content-Type Header Missing [10019]"]);
  });

  it("fails a warning that has instances", () => {
    const result = judge(QUIRK.replace("[10019] x 0", "[10019] x 2"));
    expect(result.ok).toBe(false);
    expect(result.findings).toEqual([
      { level: "WARN", name: "Content-Type Header Missing", id: "10019", count: 2 },
    ]);
  });

  it("fails FAIL and in-progress lines too", () => {
    const out = ["FAIL-NEW: X-Frame-Options Header Not Set [10020] x 3", "WARN-INPROG: Cookie No HttpOnly Flag [10010] x 1", totals(0)].join("\n");
    expect(judge(out).findings.map((f) => [f.level, f.id, f.count])).toEqual([["FAIL", "10020", 3], ["WARN", "10010", 1]]);
  });

  it("leaves INFO, IGNORE and PASS lines to ZAP's judgement", () => {
    const out = ["INFO-NEW: CSP: Notices [10055] x 14 reason", "IGNORE-NEW: Something [1] x 9", "PASS: Other [2]", totals(0)].join("\n");
    expect(judge(out)).toMatchObject({ ok: true, findings: [], ignored: [] });
  });

  it("never passes when ZAP's totals line is missing", () => {
    expect(judge("")).toMatchObject({ ok: false, complete: false });
    expect(judge("WARN-NEW: Content-Type Header Missing [10019] x 0")).toMatchObject({ ok: false, complete: false });
  });
});

describe("summary", () => {
  it("says the scan did not finish when there are no totals", () => {
    expect(summary(judge(""))).toContain("did not finish");
  });

  it("names what it ignored when it passes", () => {
    expect(summary(judge(QUIRK))).toBe(
      "ZAP gate: no untriaged findings.\n\nIgnored, every instance out of scope (rules.tsv OUTOFSCOPE): Content-Type Header Missing [10019].\n",
    );
  });

  it("lists each finding, singular and plural", () => {
    expect(summary(judge(QUIRK.replace("x 0", "x 2")))).toContain("1 untriaged finding.");
    const two = ["WARN-NEW: A [1] x 1", "WARN-NEW: B [2] x 4", totals(2)].join("\n");
    const text = summary(judge(two));
    expect(text).toContain("2 untriaged findings.");
    expect(text).toContain("- WARN: **B** [2] x 4");
  });
});

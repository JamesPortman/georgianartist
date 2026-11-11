import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { MODULES } from "../stryker.config.mjs";
import { scopeFor, SETUP_FILES } from "../scripts/mutation-scope.mjs";
import { checkScores, summary } from "../scripts/mutation-check.mjs";
import { mergeReports } from "../scripts/mutation-run.mjs";
import { slug } from "../stryker.config.mjs";

/**
 * Mutation testing runs on every pull request for the modules it touches
 * (scripts/mutation-scope.mjs) and fails a module below its floor
 * (scripts/mutation-check.mjs). Both decide whether a PR is checked at all,
 * so a bug in either would quietly stop the check.
 */

const modules = Object.keys(MODULES);
const related: Record<string, string[]> = {
  "lib/order.ts": ["__tests__/order.test.ts", "__tests__/form-email-abuse.test.ts"],
  "lib/backup.ts": ["__tests__/backup-format.test.ts"],
};
const testsFor = (m: string) => related[m] ?? [];

describe("MODULES", () => {
  it("names files that exist, each with a floor between 0 and 100", () => {
    for (const [file, { floor }] of Object.entries(MODULES)) {
      expect(fs.existsSync(file), file).toBe(true);
      expect(floor).toBeGreaterThan(0);
      expect(floor).toBeLessThanOrEqual(100);
    }
  });
});

describe("scopeFor", () => {
  it("takes a module the PR changes", () => {
    expect(scopeFor(["lib/order.ts", "README.md"], modules, testsFor)).toEqual(["lib/order.ts"]);
  });

  it("takes a module whose related test the PR changes, even one reaching it through a route", () => {
    expect(scopeFor(["__tests__/form-email-abuse.test.ts"], modules, testsFor)).toEqual(["lib/order.ts"]);
  });

  it("takes nothing for a PR that touches no module or its tests", () => {
    expect(scopeFor(["app/page.tsx", "__tests__/brand-colour.test.ts"], modules, testsFor)).toEqual([]);
  });

  it("only looks up related tests when the PR changes a test", () => {
    let calls = 0;
    scopeFor(["lib/order.ts", "app/page.tsx"], modules, (m) => (calls++, testsFor(m)));
    expect(calls).toBe(0);
  });

  it.each(SETUP_FILES)("takes every module when %s changes", (file) => {
    expect(scopeFor([file], modules, testsFor)).toEqual(modules);
  });
});

describe("checkScores", () => {
  const report = (statuses: Record<string, string[]>) => ({
    files: Object.fromEntries(
      Object.entries(statuses).map(([f, s]) => [f, { mutants: s.map((status) => ({ status })) }])
    ),
  });
  const floors = { "lib/a.ts": { floor: 75 }, "lib/b.ts": { floor: 50 } };

  it("passes at the floor, counting a timeout as killed and an untested mutant as missed", () => {
    const r = checkScores(report({ "lib/a.ts": ["Killed", "Timeout", "Killed", "NoCoverage"] }), floors);
    expect(r.rows[0]).toMatchObject({ killed: 3, total: 4, score: 75, below: false });
    expect(r.ok).toBe(true);
  });

  it("fails a module below its floor, even when another is well above", () => {
    const r = checkScores(
      report({ "lib/a.ts": ["Killed", "Killed", "Survived", "Survived"], "lib/b.ts": ["Killed"] }),
      floors
    );
    expect(r.rows.map((x) => x.below)).toEqual([true, false]);
    expect(r.ok).toBe(false);
    expect(summary(r)).toContain("❌ below floor");
  });

  it("ignores mutants that were never scored (ignored, pending)", () => {
    const r = checkScores(report({ "lib/a.ts": ["Killed", "Ignored", "Pending"] }), floors);
    expect(r.rows[0]).toMatchObject({ total: 1, score: 100 });
  });

  it("fails a run where mutants could not run at all", () => {
    const r = checkScores(report({ "lib/b.ts": ["Killed", "RuntimeError"] }), floors);
    expect(r.ok).toBe(false);
    expect(summary(r)).toContain("could not run");
  });

  it("suggests raising a floor the module has clearly outgrown", () => {
    expect(summary(checkScores(report({ "lib/b.ts": ["Killed"] }), floors))).toContain("raise the floor");
  });
});

describe("mergeReports", () => {
  it("keeps every module's files, so no module's score is dropped from the check", () => {
    const a = { schemaVersion: "2", files: { "lib/a.ts": { mutants: [{ status: "Killed" }] } } };
    const b = { schemaVersion: "2", files: { "lib/b.ts": { mutants: [{ status: "Survived" }] } } };
    expect(Object.keys(mergeReports([a, b]).files)).toEqual(["lib/a.ts", "lib/b.ts"]);
    expect(mergeReports([a, b]).schemaVersion).toBe("2");
  });

  it("refuses to merge nothing", () => {
    expect(() => mergeReports([])).toThrow();
  });
});

describe("slug", () => {
  it("gives every module a distinct, safe report name", () => {
    expect(slug("app/media/[...path]/route.ts")).toBe("app-media-path-route-ts");
    const names = modules.map(slug);
    expect(new Set(names).size).toBe(names.length);
  });
});

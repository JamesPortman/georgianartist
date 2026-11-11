import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeArchive } from "../scripts/archive-file";

/**
 * The archive a destructive script writes before it deletes is the only copy
 * of what it deleted. The analytics purge once named it by date alone, so a
 * second run that day replaced the first run's archive, and 19 deleted events
 * became unrecoverable without anything saying so.
 */

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "archive-test-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const at = (iso: string) => new Date(iso);

describe("writeArchive", () => {
  it("gives two runs on the same day their own files", () => {
    const first = writeArchive(dir, "analytics-excluded", [1, 2, 3], at("2026-09-27T14:58:01Z"));
    const second = writeArchive(dir, "analytics-excluded", [4], at("2026-09-27T15:03:12Z"));

    expect(first).not.toBe(second);
    expect(JSON.parse(fs.readFileSync(first, "utf8"))).toEqual([1, 2, 3]);
    expect(JSON.parse(fs.readFileSync(second, "utf8"))).toEqual([4]);
  });

  it("throws rather than overwrite, and leaves the first archive intact", () => {
    // Same second: the name collides. The caller must stop before deleting.
    const when = at("2026-09-27T15:03:12Z");
    const first = writeArchive(dir, "analytics-excluded", ["kept"], when);

    expect(() => writeArchive(dir, "analytics-excluded", ["replacement"], when)).toThrow(/EEXIST/);
    expect(JSON.parse(fs.readFileSync(first, "utf8"))).toEqual(["kept"]);
  });

  it("names the file to the second, in a form every filesystem accepts", () => {
    const file = writeArchive(dir, "analytics-excluded", [], at("2026-09-27T15:03:12.345Z"));
    expect(path.basename(file)).toBe("analytics-excluded-2026-09-27-15-03-12.json");
  });

  it("creates the directory if it doesn't exist yet", () => {
    const nested = path.join(dir, "deleted-rows");
    const file = writeArchive(nested, "x", {}, at("2026-09-27T00:00:00Z"));
    expect(fs.existsSync(file)).toBe(true);
  });
});

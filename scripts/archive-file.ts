import fs from "fs";
import path from "path";

/**
 * Write the archive a destructive script keeps before it deletes anything.
 *
 * The file is named to the second, and it is never written over: an existing
 * file makes this throw, before the caller reaches its delete. The analytics
 * purge used to name its archive by date alone, so a second run on the same
 * day replaced the first run's archive — rows the header promised were
 * recoverable were gone, silently. That happened once (Sept 2026, 19 events).
 */
export function writeArchive(
  dir: string,
  prefix: string,
  data: unknown,
  now: Date = new Date()
): string {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = path.join(dir, `${prefix}-${stamp}.json`);
  // "wx": create, and fail if the file already exists.
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { flag: "wx" });
  return file;
}

#!/usr/bin/env node
/**
 * Embed copyright / creator metadata into image files (EXIF + IPTC + XMP).
 *
 * Invisible to viewers, costs nothing in presentation, and travels with the
 * file: it feeds Google Images' rights display, and asserts authorship when a
 * master is sent to a magazine, gallery, or printer.
 *
 * Honest limits: Next.js re-encodes images served through /_next/image and
 * strips metadata, so this survives on the original file (and on any copy you
 * hand out), not on the optimized variants the browser renders. Most social
 * platforms strip it too. Treat it as provenance, not protection.
 *
 * Usage:
 *   npm run images:copyright -- <file-or-folder> …        # e.g. a studio export before uploading
 *   npm run images:copyright -- --dry-run               # show what would change
 *   npx tsx scripts/embed-copyright.ts path/to/folder   # any folder(s) or file(s)
 *
 * Safe to re-run — writing the same values again is a no-op for the pixels.
 * Requires exiftool:  brew install exiftool
 *
 * The claim itself lives in lib/copyright.ts, shared with the site footer and
 * with lib/image-copyright.ts (which writes the same metadata into admin
 * uploads, where there is no exiftool to shell out to). Three places assert
 * this and they have drifted apart once already — change it there, not here.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  ARTIST,
  CREDIT,
  EMAIL,
  SITE,
  USAGE_TERMS as TERMS,
  copyrightNotice,
} from "../lib/copyright";

const NOTICE = copyrightNotice();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const targets = args.filter((a) => !a.startsWith("--"));
// The catalogue's committed folders are gone (it lives on Blob, where uploads
// are stamped on the way in), so there is no default: name what to stamp.
if (!targets.length) {
  console.error("Name the files or folders to stamp: npm run images:copyright -- <path> …");
  process.exit(1);
}
const roots = targets;

function have(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!have("exiftool")) {
  console.error("exiftool not found. Install it with:  brew install exiftool");
  process.exit(1);
}

// Collect .jpg/.jpeg files from the given files/folders.
const files: string[] = [];
for (const root of roots) {
  if (!fs.existsSync(root)) {
    console.error(`Skipping missing path: ${root}`);
    continue;
  }
  if (fs.statSync(root).isDirectory()) {
    for (const name of fs.readdirSync(root).sort()) {
      if (/\.jpe?g$/i.test(name)) files.push(path.join(root, name));
    }
  } else if (/\.jpe?g$/i.test(root)) {
    files.push(root);
  }
}

if (!files.length) {
  console.error("No .jpg files found in: " + roots.join(", "));
  process.exit(1);
}

// EXIF for broad tool support, IPTC for Google Images / stock workflows,
// XMP as the modern superset. Written together so every reader finds it.
const tags = [
  `-EXIF:Artist=${ARTIST}`,
  `-EXIF:Copyright=${NOTICE}`,
  `-IPTC:By-line=${ARTIST}`,
  `-IPTC:CopyrightNotice=${NOTICE}`,
  `-IPTC:Credit=${CREDIT}`,
  `-IPTC:Source=${CREDIT}`,
  `-XMP-dc:Creator=${ARTIST}`,
  `-XMP-dc:Rights=${NOTICE}`,
  `-XMP-photoshop:Credit=${CREDIT}`,
  `-XMP-xmpRights:Marked=True`,
  `-XMP-xmpRights:WebStatement=${SITE}`,
  `-XMP-xmpRights:UsageTerms=${TERMS}`,
  `-XMP-iptcCore:CreatorWorkURL=${SITE}`,
  `-XMP-iptcCore:CreatorWorkEmail=${EMAIL}`,
];

console.log(`${dryRun ? "[dry run] " : ""}Embedding copyright in ${files.length} file(s)`);
console.log(`  Creator:   ${ARTIST}`);
console.log(`  Copyright: ${NOTICE}`);
console.log(`  Web:       ${SITE}\n`);

if (dryRun) {
  files.forEach((f: string) => console.log("  would tag " + f));
  process.exit(0);
}

// -overwrite_original: no *_original backup files left in the tree (git is the
// safety net). -P preserves file modification times.
const out = execFileSync(
  "exiftool",
  ["-overwrite_original", "-P", "-q", ...tags, ...files],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
);
if (out.trim()) console.log(out.trim());
console.log(`Done — ${files.length} file(s) tagged.`);

import { describe, it, expect } from "vitest";
import { AREAS, blobUrlsIn, findOrphans, uncoveredFolders } from "@/lib/blob-prune";

const HOST = "https://abc123.public.blob.vercel-storage.com";
const NOW = Date.parse("2026-09-29T12:00:00Z");
const DAYS_AGO = (n: number) => new Date(NOW - n * 86_400_000);
const blob = (pathname: string, uploadedAt = DAYS_AGO(30)) => ({
  url: `${HOST}/${pathname}`,
  pathname,
  size: 1000,
  uploadedAt,
});

describe("which folders the pruner sweeps", () => {
  it("covers every folder the admin uploads to", () => {
    // app/actions/admin.ts writes paintings/, photographs/, inspiration/ and
    // homes/. The first two went unswept until September 2026.
    const prefixes = Object.values(AREAS).map((a) => a.prefix);
    for (const p of ["paintings/", "photographs/", "inspiration/", "homes/"]) {
      expect(prefixes).toContain(p);
    }
  });

  it("gives every admin upload folder a grace period, since the file is written before its row", () => {
    for (const a of [AREAS.paintings, AREAS.photographs, AREAS.homes]) {
      expect(a.minAgeHours).toBeGreaterThanOrEqual(24);
    }
  });

  it("reports a folder no area covers, and leaves the kept folders alone", () => {
    const gaps = uncoveredFolders([
      "paintings/a.jpg",
      "making-of/faststart/x.mp4",
      "backups/catalog-2026-09-28-xyz.json",
      "press/blank-spaces-feature-abc.jpg",
      "mockups/a.jpg",
      "mockups/b.jpg",
      "stray.jpg",
    ]);
    expect([...gaps]).toEqual([
      ["mockups/", 2],
      ["(top level)", 1],
    ]);
  });
});

describe("what counts as a reference in the repository", () => {
  it("finds complete Blob URLs, without their query string", () => {
    const text = `const a = "${HOST}/paintings/lora-bay-XyZ.jpg?v=2"; <img src='${HOST}/homes/h.jpg'>`;
    expect(blobUrlsIn(text)).toEqual([`${HOST}/paintings/lora-bay-XyZ.jpg`, `${HOST}/homes/h.jpg`]);
  });

  it("does not count a repo path with the same name as a blob", () => {
    // The catalogue's images live in public/ at the same names as some old
    // uploads. Matching the path alone once made seven orphans look in use.
    expect(blobUrlsIn(`image: "/photographs/autumn-canopy.jpg"`)).toEqual([]);
  });
});

describe("findOrphans", () => {
  it("keeps anything a row or the repo references", () => {
    const blobs = [blob("paintings/kept.jpg"), blob("paintings/litter.jpg")];
    const refs = new Set([`${HOST}/paintings/kept.jpg`]);
    expect(findOrphans(blobs, AREAS.paintings, refs, NOW).map((b) => b.pathname)).toEqual([
      "paintings/litter.jpg",
    ]);
  });

  it("keeps an unreferenced upload younger than the grace period", () => {
    // The admin uploads before it inserts the product; for those moments the
    // new image is referenced by nothing.
    const fresh = blob("paintings/just-uploaded.jpg", new Date(NOW - 60_000));
    expect(findOrphans([fresh], AREAS.paintings, new Set(), NOW)).toEqual([]);
  });

  it("only considers blobs under the area's own folder", () => {
    const other = blob("homes/someone-elses.jpg");
    expect(findOrphans([other], AREAS.paintings, new Set(), NOW)).toEqual([]);
  });

  it("compares URLs without their query string", () => {
    const b = { ...blob("photographs/p.jpg"), url: `${HOST}/photographs/p.jpg?download=1` };
    expect(findOrphans([b], AREAS.photographs, new Set([`${HOST}/photographs/p.jpg`]), NOW)).toEqual([]);
  });
});

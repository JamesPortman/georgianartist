/**
 * The decisions behind `npm run blobs:prune` (scripts/prune-orphan-blobs.ts),
 * kept free of I/O so they can be tested: which folders it sweeps, what counts
 * as a reference, and which blobs are orphans.
 *
 * Until 29 Sep 2026 it swept only four folders, and nothing said so. Nine
 * orphans had built up unseen in paintings/ and photographs/ by then, found
 * only by listing the whole store by hand. So every folder the admin writes to
 * is covered now, and `uncoveredFolders` reports any the pruner doesn't know,
 * so the next one can't go unnoticed the same way.
 */

export type AreaName = "films" | "inspiration" | "igready" | "reels" | "paintings" | "photographs" | "homes";
export type Area = { prefix: string; what: string; minAgeHours?: number };

export const AREAS: Record<AreaName, Area> = {
  films: { prefix: "making-of/", what: "making-of films and posters" },
  inspiration: { prefix: "inspiration/", what: "inspiration photos" },
  igready: {
    prefix: "igready/",
    what: "letterboxed copies made for Instagram",
    // Never referenced by anything, so the reference check alone would happily
    // delete one out from under a publish in flight.
    minAgeHours: 24,
  },
  reels: {
    prefix: "reels/",
    what: "source video for queued Instagram reels",
    // Unlike igready/, these ARE referenced, by InstagramPost.imageUrl, and
    // for a pending or approved post the blob is the only copy there is. The
    // age gate covers only the upload-then-caption-then-insert window in
    // queue-reels.ts, where a blob that is about to be referenced is not yet.
    minAgeHours: 24,
  },
  // The admin's uploads. Each is written before the row that points at it
  // (createProduct uploads, then inserts; an edit uploads, then updates), so a
  // new upload is briefly an orphan by every test here; hence the grace period.
  // What is left behind: uploads for products later re-pointed at the repo's
  // own copy in public/, and an upload whose row was never written because the
  // insert failed.
  paintings: { prefix: "paintings/", what: "painting images uploaded through the admin", minAgeHours: 24 },
  photographs: { prefix: "photographs/", what: "photograph images uploaded through the admin", minAgeHours: 24 },
  homes: {
    prefix: "homes/",
    what: "collectors' photos of a work in their home",
    // These are other people's photographs. The archive the pruner keeps is
    // a copy of someone's room on this machine; delete it once nothing is
    // missed.
    minAgeHours: 24,
  },
};

/**
 * Folders deliberately never pruned.
 *
 *   backups/  the catalogue snapshots, which nothing references by
 *             design; the backup cron keeps the newest seven itself.
 *   press/    press material uploaded by hand (the Blank Spaces feature
 *             image, Sep 2026). The site doesn't use it, but its URL may have
 *             been shared outside the site, where deleting it would break a
 *             link nothing here can see. Kept on the owner's say-so.
 *   catalogue/ the catalogue's own images, moved from public/ in October 2026
 *             (lib/catalogue-images.ts). Removed by hand, never by a sweep.
 */
export const NEVER_PRUNED = ["backups/", "press/", "catalogue/"];

/** Blob URLs are compared without any query string. */
export const blobKey = (url: string): string => url.split("?")[0] ?? url;

/**
 * Every complete Blob URL written in a piece of text.
 *
 * A reference is a full URL on the store's host, never a bare path: the
 * catalogue's own images lived in the repo at the same names (under
 * public/photographs/, until October 2026), and matching on the path alone once
 * made seven genuine orphans look in use.
 */
export function blobUrlsIn(text: string): string[] {
  return [...text.matchAll(/https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s"'`<>)\]\\]+/gi)].map(
    (m) => blobKey(m[0])
  );
}

export type BlobInfo = { url: string; pathname: string; size: number; uploadedAt: Date | string };

/**
 * The blobs under an area that nothing references and that are old enough.
 * Both conditions, always: the age gate protects an upload whose row is not
 * written yet, the reference check everything else.
 */
export function findOrphans(
  blobs: BlobInfo[],
  area: Area,
  refs: { has(key: string): boolean },
  now = Date.now()
): BlobInfo[] {
  const cutoff = now - (area.minAgeHours ?? 0) * 3_600_000;
  return blobs.filter(
    (b) =>
      b.pathname.startsWith(area.prefix) &&
      !refs.has(blobKey(b.url)) &&
      new Date(b.uploadedAt).getTime() < cutoff
  );
}

/**
 * Top-level folders in the store that no area sweeps and that aren't kept on
 * purpose, with how many blobs each holds. Anything here is a gap in the
 * pruner, not something to delete.
 */
export function uncoveredFolders(pathnames: string[]): Map<string, number> {
  const known = [...Object.values(AREAS).map((a) => a.prefix), ...NEVER_PRUNED];
  const out = new Map<string, number>();
  for (const p of pathnames) {
    if (known.some((k) => p.startsWith(k))) continue;
    const folder = p.includes("/") ? `${p.split("/")[0]}/` : "(top level)";
    out.set(folder, (out.get(folder) ?? 0) + 1);
  }
  return out;
}

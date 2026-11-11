/**
 * The catalogue's own images on Blob.
 *
 * Until October 2026 the catalogue lived in two places: the original works as
 * files in public/paintings, public/photographs and public/mockups (committed,
 * so git history carried every revision), and anything uploaded since only on
 * Blob, until someone remembered to commit it too. Blob is now the one home:
 * a one-off script copied each committed file to Blob under
 * `catalogue/<same path>` and repointed the rows, and the files left the repo.
 * `scripts/assert-catalogue-on-blob.ts` stops a deploy if any row still names
 * one of those old paths, since nothing serves them any more.
 *
 * Everything under `catalogue/` is kept by hand, never by a sweep: the Blob
 * pruner skips it (NEVER_PRUNED) and the admin's releaseBlob() never deletes
 * it, since for some of these files the Blob copy is the only one outside git
 * history.
 */

import { siteConfig } from "@/data/siteConfig";

export const CATALOGUE_PREFIX = "catalogue/";

/** The folders that held committed catalogue images, as site paths. */
export const LOCAL_CATALOGUE_DIRS = ["paintings", "photographs", "mockups"] as const;

/** Whether a URL is one of the committed files under public/, e.g. /paintings/x.jpg. */
export function isLocalCatalogueImage(url: string | null | undefined): url is string {
  if (!url) return false;
  return LOCAL_CATALOGUE_DIRS.some((d) => url.startsWith(`/${d}/`));
}

/** /paintings/x.jpg → catalogue/paintings/x.jpg, the file's pathname on Blob. */
export function catalogueBlobPathname(localPath: string): string {
  if (!isLocalCatalogueImage(localPath)) throw new Error(`Not a catalogue path: ${localPath}`);
  return `${CATALOGUE_PREFIX}${localPath.replace(/^\//, "")}`;
}

/** Whether a Blob URL is one of the migrated catalogue files. */
export function isCatalogueBlob(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.startsWith(`/${CATALOGUE_PREFIX}`);
  } catch {
    return false;
  }
}

/**
 * The "In a Room" mockup to show for a painting (its Blob URL), or null when it
 * has none and the page composes one in CSS, as for every admin upload.
 */
export function mockupFor(p: { mockupImage?: string | null }): string | null {
  return p.mockupImage ?? null;
}

/**
 * An image URL anything off the site can fetch: a Blob URL as it is, a path
 * on the site's own origin. Concatenating the origin onto every image, as the
 * work pages' JSON-LD did, turned each Blob upload into an origin glued to a
 * second URL.
 */
export function absoluteImageUrl(image: string): string {
  if (/^https?:\/\//.test(image)) return image;
  return `${siteConfig.url}${image.startsWith("/") ? "" : "/"}${image}`;
}

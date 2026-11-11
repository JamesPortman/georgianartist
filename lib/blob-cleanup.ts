/**
 * Deleting a blob that something else still points at.
 *
 * Two bugs live at the same three call sites in the admin, and they pull in
 * opposite directions:
 *
 *   Leaking — deleting a product removed its main image from Blob but never
 *   its inspiration photo, so every deleted product stranded one in the store.
 *   Seven had accumulated by 2026-09-11.
 *
 *   Over-deleting — the cleanup assumed a blob belongs to exactly one product.
 *   It doesn't. `bruce-trail-epping` and `bruce-trail-craigleith` shared an
 *   inspiration photo, so deleting either product, or replacing either photo,
 *   would have taken the image out from under a painting that was live on the
 *   site. Nothing would have errored; the page would just start serving a 404
 *   where a photograph used to be.
 *
 * So cleanup can't be "delete the URL this row held". It has to be "delete the
 * URL this row held, if nothing else holds it too" — and "anything else" means
 * every table that stores a URL, not just Product. An inspiration photo can
 * equally be the image on a queued Instagram post.
 *
 * The bias is to keep. A leaked blob costs a few hundred KB and is swept up by
 * `npm run blobs:prune`; a wrongly deleted one is gone, and takes a live page
 * with it.
 */

import { del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { isCatalogueBlob } from "@/lib/catalogue-images";
import { deleteMedia, isMediaUrl } from "@/lib/private-blob";

const BLOB_HOST = ".blob.vercel-storage.com";

export const isBlobUrl = (url: string | null | undefined): url is string =>
  !!url && url.includes(BLOB_HOST);

/** Blob URLs are compared without any query string. */
const key = (url: string) => url.split("?")[0];

/**
 * How many rows still reference this URL, ignoring one product (the one being
 * deleted or edited, whose own reference doesn't count).
 */
export async function countReferences(
  url: string,
  opts: { excludeProductId?: string } = {}
): Promise<number> {
  const target = key(url);
  const { excludeProductId } = opts;

  const [products, posts, films] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, image: true, inspirationImage: true, homePhoto: true, mockupImage: true },
    }),
    prisma.instagramPost.findMany({ select: { imageUrl: true } }),
    prisma.makingOf.findMany({ select: { videoUrl: true, posterUrl: true } }),
  ]);

  let n = 0;
  for (const p of products) {
    if (p.id === excludeProductId) continue;
    if (p.image && key(p.image) === target) n++;
    if (p.inspirationImage && key(p.inspirationImage) === target) n++;
    if (p.homePhoto && key(p.homePhoto) === target) n++;
    if (p.mockupImage && key(p.mockupImage) === target) n++;
  }
  for (const p of posts) if (p.imageUrl && key(p.imageUrl) === target) n++;
  for (const f of films) {
    if (f.videoUrl && key(f.videoUrl) === target) n++;
    if (f.posterUrl && key(f.posterUrl) === target) n++;
  }
  return n;
}

export type ReleaseResult = "deleted" | "kept" | "not-a-blob";

/**
 * Delete a blob, but only if nothing else references it.
 *
 * Never throws: a failure here must not fail the delete or edit the user
 * actually asked for. The blob simply stays, and `npm run blobs:prune` will
 * find it later.
 */
export async function releaseBlob(
  url: string | null | undefined,
  opts: { excludeProductId?: string } = {}
): Promise<ReleaseResult> {
  // An upload in the private store, held as a /media path (lib/private-blob.ts).
  if (isMediaUrl(url)) {
    try {
      if ((await countReferences(url, opts)) > 0) return "kept";
      await deleteMedia(url);
      return "deleted";
    } catch {
      return "kept";
    }
  }
  if (!isBlobUrl(url)) return "not-a-blob";
  // The catalogue's own images are removed by hand, never as a side effect of
  // an edit: for some, Blob is the only copy outside git history.
  if (isCatalogueBlob(url)) return "kept";
  try {
    if ((await countReferences(url, opts)) > 0) return "kept";
    await del(url);
    return "deleted";
  } catch {
    // Leaving a blob behind is the safe failure. Prune sweeps it up.
    return "kept";
  }
}

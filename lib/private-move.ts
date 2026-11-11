import { MEDIA_FOLDERS, mediaPath } from "./private-blob";

/**
 * Which public-store files belong in the private store, for
 * scripts/move-to-private-store.ts.
 *
 * Until October 2026 the private store had never been connected, so
 * everything lib/private-blob.ts would have kept private went to the public
 * store (docs/security-review-2026-10.md, finding 1):
 *   - collectors' photos of their homes, for every work;
 *   - the image and inspiration photo of every work that isn't visible yet.
 * Backups are moved separately (they have no database row).
 *
 * A published work's own images stay public: they are on the live site.
 */

export type ProductImages = {
  id: string;
  visible: boolean;
  image: string;
  inspirationImage: string | null;
  homePhoto: string | null;
};

export type Move = {
  productId: string;
  field: "image" | "inspirationImage" | "homePhoto";
  /** The public store URL the row holds now. */
  from: string;
  /** The store pathname, the same in both stores. */
  pathname: string;
  /** What the row will hold: /media/<pathname>. */
  to: string;
};

const PUBLIC_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

/** The pathname of a public Blob URL in one of the upload folders, or null. */
export function movablePathname(url: string | null): string | null {
  if (!url || !PUBLIC_HOST.test(url)) return null;
  const pathname = decodeURIComponent(url.replace(PUBLIC_HOST, "").split("?")[0] ?? "");
  if (!MEDIA_FOLDERS.some((f) => pathname.startsWith(f))) return null;
  // The same rule /media serves by (lib/private-blob.ts mediaPathname).
  if (!/^[a-z-]+\/[A-Za-z0-9._-]+$/.test(pathname)) return null;
  return pathname;
}

export function planMoves(products: ProductImages[]): Move[] {
  const moves: Move[] = [];
  for (const p of products) {
    const fields: Move["field"][] = p.visible ? ["homePhoto"] : ["image", "inspirationImage", "homePhoto"];
    for (const field of fields) {
      const from = p[field];
      const pathname = movablePathname(from);
      if (from && pathname) moves.push({ productId: p.id, field, from, pathname, to: mediaPath(pathname) });
    }
  }
  return moves;
}

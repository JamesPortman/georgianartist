import { put, del } from "@vercel/blob";

/**
 * The second, private Blob store.
 *
 * The first store is public: anything in it is readable by anyone holding the
 * URL, for as long as the file exists, whatever the site says about the work.
 * That is fine for published artwork and wrong for three things:
 *
 *   - the catalogue backups, which hold hidden works, collectors' credits and
 *     the source photos' coordinates (app/api/cron/backup);
 *   - uploads for works not published yet, whose image was fetchable before
 *     the work was ever shown;
 *   - collectors' photos of their homes, which should stop being reachable
 *     the moment the work is hidden or the photo is removed.
 *
 * So those go to a private store (its own token, PRIVATE_BLOB_READ_WRITE_TOKEN,
 * from a second Blob store connected with the prefix PRIVATE_BLOB). Uploads are
 * stored as site paths, /media/<pathname>, and served by app/media/[...path],
 * which answers only for a visible work or a signed-in admin.
 *
 * Until that store exists everything falls back to the public store exactly as
 * before, so this can deploy first and take effect when the token is set.
 */

export const PRIVATE_TOKEN_ENV = "PRIVATE_BLOB_READ_WRITE_TOKEN";

export function privateBlobToken(): string | null {
  return process.env[PRIVATE_TOKEN_ENV] || null;
}

/** The folders the admin uploads into, and so the only ones /media serves. */
export const MEDIA_FOLDERS = ["paintings/", "photographs/", "inspiration/", "homes/"] as const;

export const mediaPath = (pathname: string): string => `/media/${pathname}`;

export const isMediaUrl = (url: string | null | undefined): url is string =>
  !!url && url.startsWith("/media/");

/**
 * "/media/homes/x.jpg" → "homes/x.jpg", or null for anything that isn't a
 * plain file in one of MEDIA_FOLDERS. Backups share the private store, so this
 * allowlist is what keeps /media from ever reaching them.
 */
export function mediaPathname(url: string): string | null {
  if (!isMediaUrl(url)) return null;
  const pathname = url.slice("/media/".length).split("?")[0] ?? "";
  if (!MEDIA_FOLDERS.some((f) => pathname.startsWith(f))) return null;
  if (pathname.includes("..") || pathname.includes("//") || pathname.includes("\\")) return null;
  if (!/^[a-z-]+\/[A-Za-z0-9._-]+$/.test(pathname)) return null;
  return pathname;
}

/**
 * Upload an admin image. To the private store when it exists, returned as a
 * /media path; otherwise to the public store, returned as its URL, as before.
 */
export async function uploadMedia(
  pathname: string,
  body: Buffer,
  opts: { contentType: string; addRandomSuffix: boolean }
): Promise<string> {
  const token = privateBlobToken();
  if (!token) {
    const blob = await put(pathname, body, { access: "public", ...opts });
    return blob.url;
  }
  const blob = await put(pathname, body, { access: "private", token, ...opts });
  return mediaPath(blob.pathname);
}

/** Delete a /media file from the private store. */
export async function deleteMedia(url: string): Promise<void> {
  const pathname = mediaPathname(url);
  const token = privateBlobToken();
  if (!pathname || !token) return;
  await del(pathname, { token });
}

/**
 * Media helpers shared by server code and the admin UI.
 *
 * This lives apart from lib/instagram.ts on purpose: that module imports the
 * Anthropic SDK at the top level, so a client component importing from it would
 * drag the SDK into the browser bundle.
 */

/** Reels are queued in the same imageUrl column as images, so the media type is
 *  decided by the file extension. */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|m4v)(\?|#|$)/i.test(url);
}

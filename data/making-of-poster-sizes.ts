/**
 * Intrinsic size of each film poster, measured from the file itself.
 *
 * The player is a next/image facade now rather than a <video poster>, and
 * next/image has to reserve the right box before the bytes arrive. A single
 * fixed aspect would be wrong for this catalogue: the films run from 2.5:1
 * panoramas (scenic-caves, 1920x770) through 4:3 to one portrait
 * (bruce-trail-grey-highlands, 1439x1920). Guessing 4:3 for that last one puts
 * a painting in a letterbox on its own page.
 *
 * This lives here rather than on the MakingOf row because films are only ever
 * created from the repo — prisma/seed.ts and scripts/publish-films.ts, never
 * the admin — so this file is edited in the same commit that adds a film, the
 * same discipline data/making-of.ts already documents. A film with no entry
 * falls back to 4:3 and shifts once on load; nothing breaks.
 *
 * Regenerate with:
 *   ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
 *     -of csv=p=0 "<posterUrl>"
 */
export type PosterSize = { width: number; height: number };

/** The most common shape here, used when a film has not been measured. */
export const FALLBACK_POSTER_SIZE: PosterSize = { width: 1920, height: 1440 };

export const posterSizes: Record<string, PosterSize> = {
  "local-farm-sunflowers": { width: 1920, height: 1440 },
  "manitoulin-island": { width: 1920, height: 1440 },
  "peasemarsh": { width: 1920, height: 1440 },
  "bridal-veil-falls": { width: 1920, height: 1358 },
  "inglis-falls": { width: 1358, height: 1358 },
  "top-of-blue-mountain": { width: 1920, height: 960 },
  "ravenna-canola": { width: 1920, height: 1358 },
  "the-grotto": { width: 1920, height: 960 },
  "blue-mountain-sunrise": { width: 1920, height: 1440 },
  "near-killarney": { width: 1920, height: 1440 },
  "scenic-caves": { width: 1920, height: 770 },
  "singhampton": { width: 1920, height: 1440 },
  "delphi-point": { width: 1920, height: 788 },
  "lora-bay": { width: 1920, height: 1440 },
  "blue-mountain-trail": { width: 1920, height: 960 },
  "alpine-ski-fall": { width: 1920, height: 1440 },
  "council-beach": { width: 1920, height: 1440 },
  "northwinds-beach": { width: 1920, height: 1175 },
  "beaver-river-access": { width: 1920, height: 1440 },
  "blue-mountain-sunset": { width: 1920, height: 1440 },
  "bruce-trail-grey-highlands": { width: 1439, height: 1920 },
  "bruce-trail-epping": { width: 1920, height: 1440 },
};

export function posterSizeFor(filmId: string): PosterSize {
  return posterSizes[filmId] ?? FALLBACK_POSTER_SIZE;
}

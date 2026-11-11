import { photographs } from "../data/photographs";

/**
 * Which catalogue works the specs use.
 *
 * These used to be hardcoded slugs scattered across the specs, and works get
 * deleted: the admin spec has been repointed three times (lone-tree →
 * northwinds-beach → lora-bay), and deleting clarksburg-library broke two more
 * specs in a way that surfaced as a 30-second Playwright timeout rather than
 * anything that named the cause.
 *
 * So they're resolved from the seed instead. Each one names a preferred work —
 * keeping fixtures stable while that work exists, so diffs stay readable — but
 * falls back to any seeded photograph with the same shape, and throws with a
 * usable message if the seed can't satisfy it at all.
 */

const isPanoramic = (sizeType: string) =>
  sizeType === "panoramic" || sizeType === "ultrawide";

function resolve(
  label: string,
  preferred: string,
  matches: (p: (typeof photographs)[number]) => boolean
): string {
  const first = photographs.find((p) => p.id === preferred);
  if (first && matches(first)) return first.id;
  const fallback = photographs.find(matches);
  if (!fallback) {
    throw new Error(
      `No seeded photograph fits the "${label}" fixture (preferred "${preferred}" is ` +
        `missing or no longer matches). Add one to data/photographs.ts or update e2e/fixtures.ts.`
    );
  }
  return fallback.id;
}

/** Standard layout: the location map renders inline on the detail page. */
export const PHOTO_WITH_MAP = resolve(
  "standard layout",
  "clarksburg-library",
  (p) => !isPanoramic(p.sizeType)
);

/** Panoramic layout: the map renders in a different place. */
export const PHOTO_PANORAMIC = resolve(
  "panoramic layout",
  "the-grotto",
  (p) => isPanoramic(p.sizeType)
);

/**
 * The negative case. global-setup CLEARS its coordinates so the no-map path
 * has cover — it must not be the same work as PHOTO_WITH_MAP, which needs them.
 */
export const PHOTO_WITHOUT_GPS = resolve(
  "no-GPS negative case",
  "ravenna-canola-photo",
  (p) => !isPanoramic(p.sizeType) && p.id !== PHOTO_WITH_MAP
);

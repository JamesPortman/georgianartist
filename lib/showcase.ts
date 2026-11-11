import { catalogue } from "@/lib/catalogue-cache";
import { blurDataURLs } from "@/data/blurs";

export type Showcase = {
  id: string;
  title: string;
  image: string;
  blurDataURL?: string;
};

/**
 * Deterministic index for `key` over a list of `length`.
 *
 * Deliberately not random: a thumbnail that reshuffled on every request would
 * make the page flicker between renders and defeat image caching. Same key +
 * same catalogue = same pick, and it only changes when the catalogue does.
 */
function pick(key: string, length: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % length;
}

/**
 * Currently-visible works, ordered stably, for anywhere the site needs to show
 * "some artwork" rather than one specific piece.
 *
 * Everything that shows a work should route through here rather than naming an
 * image by path. Hardcoded paths cannot know that a work has been hidden, and
 * two of the gift shop's three thumbnails had gone stale exactly that way.
 *
 * `forSale` leaves out sold-out work too — for the gift shop, which sells
 * cards and calendars of the work that is still available, not of editions
 * that have closed. Off by default: the site's share image may still be any
 * visible work.
 */
export async function getVisibleWorks(
  type?: "painting" | "photograph",
  { forSale = false }: { forSale?: boolean } = {}
): Promise<Showcase[]> {
  const rows = await catalogue.product.findMany({
    where: { visible: true, ...(type ? { type } : {}), ...(forSale ? { soldOut: false } : {}) },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    select: { id: true, title: true, image: true, blurDataURL: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    image: r.image,
    blurDataURL: r.blurDataURL ?? blurDataURLs[r.id],
  }));
}

/**
 * One visible work, chosen deterministically from `key`. Returns null only when
 * the catalogue has nothing visible at all, which callers must handle rather
 * than rendering a broken image.
 */
export function showcaseFor(works: Showcase[], key: string): Showcase | null {
  if (!works.length) return null;
  return works[pick(key, works.length)] ?? null;
}

/**
 * One work per slot, all different — for a row of cards, where the same
 * painting twice looks like a mistake (the gift shop once showed the same
 * farm on two of its three cards). A slot's `preferred` work is used while it
 * is in `works` (visible, and for sale if the caller asked); the rest get
 * their deterministic pick, stepping past anything already taken. Repeats only
 * when there are fewer works than slots.
 */
export function distinctShowcases(
  works: Showcase[],
  slots: { key: string; preferred?: string }[]
): (Showcase | null)[] {
  if (!works.length) return slots.map(() => null);
  const taken = new Set<string>();
  const chosen: (Showcase | null)[] = slots.map(({ preferred }) => {
    const hit = preferred ? works.find((w) => w.id === preferred && !taken.has(w.id)) : undefined;
    if (hit) taken.add(hit.id);
    return hit ?? null;
  });
  return slots.map(({ key }, i) => {
    const hit = chosen[i];
    if (hit) return hit;
    const start = pick(key, works.length);
    for (let step = 0; step < works.length; step++) {
      const w = works[(start + step) % works.length];
      if (w && !taken.has(w.id)) {
        taken.add(w.id);
        return w;
      }
    }
    return works[start] ?? null;
  });
}

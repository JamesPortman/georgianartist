/**
 * Which works belong in a gallery grid, given the active filter, and in what
 * order.
 *
 *   Sold-out filter      only sold-out work
 *   New / On sale        only work you can buy — a sold-out piece is neither
 *   All, or a category   everything, with sold-out work after all of it
 *
 * Sold-out work used to be kept out of every view except its own filter. That
 * kept the shop grid purely buyable, but it also hid the site's best evidence:
 * collectors' photos of paintings in their homes exist only on sold-out work,
 * so the most persuasive thing on the site sat behind a dropdown. It now
 * follows the work for sale, marked, and never interleaved with it — whatever
 * sort is chosen, `soldOutLast` puts it at the end.
 *
 * It lives here rather than inline in the two gallery clients because those
 * clients filter differently — the paintings grid has New and Sale pseudo-
 * categories the photographs grid doesn't — and a rule copied into both is a
 * rule that will be changed in one.
 */

/**
 * Sentinel category for "show the archive". Shares the `__x__` shape with the
 * existing `__new__` and `__sale__` pseudo-categories, so it slides into the
 * same <select> and the same URL parameter.
 */
export const SOLD_OUT_FILTER = "__soldout__";

/** Views that exist to sell something, so sold-out work has no place in them. */
const BUYABLE_ONLY = new Set(["__new__", "__sale__"]);

/** Whether this view leaves sold-out work out entirely. */
export function excludesSoldOut(activeCategory: string | null): boolean {
  return activeCategory !== null && BUYABLE_ONLY.has(activeCategory);
}

export function matchesAvailability(
  item: { soldOut?: boolean },
  activeCategory: string | null
): boolean {
  if (activeCategory === SOLD_OUT_FILTER) return !!item.soldOut;
  if (excludesSoldOut(activeCategory)) return !item.soldOut;
  return true;
}

/**
 * Everything for sale first, sold-out work after it, each keeping the order it
 * arrived in.
 *
 * Applied after the chosen sort rather than folded into it, so "Price: Low to
 * High" still sorts both groups by price — it just never lets a sold-out piece
 * sit between two things someone can actually order.
 */
export function soldOutLast<T extends { soldOut?: boolean }>(items: T[]): T[] {
  return [...items.filter((p) => !p.soldOut), ...items.filter((p) => p.soldOut)];
}

/**
 * Sold-out works a search would match.
 *
 * Powers the "nothing matched, but N sold pieces did" hint, which now only
 * applies in views that leave sold-out work out (New, On sale) — everywhere
 * else those works are already in the grid. Someone searching for a painting
 * they saw in a friend's kitchen is exactly who the archive is for.
 */
export function soldOutMatches<T extends { soldOut?: boolean; title: string }>(
  items: T[],
  query: string
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter((p) => p.soldOut && p.title.toLowerCase().includes(q));
}

/**
 * schema.org availability for a work's JSON-LD.
 *
 * Structured data is read by machines that will not notice the "Sold out"
 * badge next to it. Leaving this at InStock is how a sold-out piece keeps
 * showing a price in a Google result long after the page stopped offering one.
 */
export function availabilitySchema(soldOut?: boolean): string {
  return soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock";
}

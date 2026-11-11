import type { ReactNode } from "react";

/**
 * A gallery grid that keeps sold-out work in its own section at the end.
 *
 * Sold-out paintings appear in the ordinary gallery views now, because the
 * collectors' photos that make the strongest case for the site live on them.
 * But they come after everything for sale, under their own heading, rather
 * than in the same grid: a visitor scanning for something to buy should reach
 * the end of what they can buy before meeting what they can't, and should be
 * able to tell where that line is without reading every badge.
 *
 * In the Sold-out filter view every item is sold out, so the heading would
 * only repeat the filter — it renders as one plain grid there.
 *
 * Shared by both galleries so they cannot drift apart.
 */
const GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5";

/**
 * Cards whose images load first: the first row on a phone (two columns),
 * which holds the page's largest image. Every card image was lazy, so the
 * one a visitor sees first waited for the page's JavaScript: Lighthouse
 * measured the photographs' Largest Contentful Paint anywhere from 2.9 s to
 * 7.5 s on the same code.
 */
const ABOVE_THE_FOLD = 2;

export default function GalleryGrid<T extends { id: string; soldOut?: boolean }>({
  items,
  render,
  soldOutView = false,
  heading,
}: {
  items: T[];
  /**
   * Must return an element keyed by the item's id. `priority` is true for the
   * first cards on screen, whose images should load eagerly.
   */
  render: (item: T, priority: boolean) => ReactNode;
  /** True when the Sold-out filter is active. */
  soldOutView?: boolean;
  /**
   * A heading for screen readers over the grid ("Paintings"), so its cards'
   * h3 titles sit under an h2 rather than straight under the page's h1.
   */
  heading?: string;
}) {
  const title = heading ? <h2 className="sr-only">{heading}</h2> : null;
  const first = (list: T[]) => list.map((item, i) => render(item, i < ABOVE_THE_FOLD));
  if (soldOutView) return <>{title}<div className={GRID}>{first(items)}</div></>;

  const forSale = items.filter((p) => !p.soldOut);
  const sold = items.filter((p) => p.soldOut);

  return (
    <>
      {title}
      {forSale.length > 0 && <div className={GRID}>{first(forSale)}</div>}

      {sold.length > 0 && (
        <section aria-labelledby="gallery-sold-out" className={forSale.length > 0 ? "mt-14" : ""}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-gray-200 pt-6 mb-5">
            <h2
              id="gallery-sold-out"
              className="text-sm font-medium text-gray-500 uppercase tracking-wider"
            >
              Sold out
            </h2>
            <p className="text-sm text-gray-500">Every limited edition of these prints has found a home.</p>
          </div>
          <div className={GRID}>{forSale.length > 0 ? sold.map((item) => render(item, false)) : first(sold)}</div>
        </section>
      )}
    </>
  );
}

/**
 * Display order from engagement: how the gallery's "Featured" order was set
 * on 28 Sep 2026, and how scripts/rank-by-engagement.ts sets it again.
 *
 * A work's score counts distinct visitors, so one person refreshing can't top
 * the list: a page view 1, a click from the gallery 1, opening Buy Now 3, an
 * order 10. The owner's browsers are excluded at ingest and bots are dropped,
 * so neither is in here.
 *
 * Only works with at least MIN_VIEWERS distinct viewers are ranked; the rest
 * keep their current order behind them. Ranking works seen by one or two
 * people would be shuffling at random — and it would push new work, which has
 * no data yet, to the bottom. Sold-out work stays after everything for sale,
 * ranked the same way among itself.
 */

export const WEIGHTS = { view: 1, click: 1, buyOpen: 3, order: 10 } as const;
export const MIN_VIEWERS = 3;

export type EngagementRow = {
  id: string;
  soldOut: boolean;
  sortOrder: number;
  viewers: number;
  clickers: number;
  buyOpeners: number;
  buyers: number;
};

export function engagementScore(r: EngagementRow): number {
  return (
    r.viewers * WEIGHTS.view +
    r.clickers * WEIGHTS.click +
    r.buyOpeners * WEIGHTS.buyOpen +
    r.buyers * WEIGHTS.order
  );
}

/** Ids of one type of work (all paintings, or all photographs) in their new order. */
export function rankByEngagement(rows: EngagementRow[]): string[] {
  const order = (group: EngagementRow[]) => {
    const current = [...group].sort((a, b) => a.sortOrder - b.sortOrder);
    const ranked = current
      .filter((r) => r.viewers >= MIN_VIEWERS)
      .sort((a, b) => engagementScore(b) - engagementScore(a) || a.sortOrder - b.sortOrder);
    const unranked = current.filter((r) => r.viewers < MIN_VIEWERS);
    return [...ranked, ...unranked];
  };
  return [...order(rows.filter((r) => !r.soldOut)), ...order(rows.filter((r) => r.soldOut))].map((r) => r.id);
}

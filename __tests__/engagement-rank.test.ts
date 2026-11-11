import { describe, it, expect } from "vitest";
import { engagementScore, rankByEngagement, MIN_VIEWERS, type EngagementRow } from "../lib/engagement-rank";

const row = (id: string, sortOrder: number, over: Partial<EngagementRow> = {}): EngagementRow => ({
  id, sortOrder, soldOut: false, viewers: 0, clickers: 0, buyOpeners: 0, buyers: 0, ...over,
});

describe("engagement ranking", () => {
  it("weights an order above a Buy Now open above a view", () => {
    expect(engagementScore(row("a", 0, { viewers: 1, clickers: 1, buyOpeners: 1, buyers: 1 }))).toBe(15);
  });

  it("puts the most engaging work first, whatever its current position", () => {
    const ids = rankByEngagement([
      row("council-beach", 0, { viewers: 18 }),
      row("scenic-caves", 19, { viewers: 32, clickers: 10 }),
    ]);
    expect(ids).toEqual(["scenic-caves", "council-beach"]);
  });

  it("leaves works with too few viewers in their current order, after the ranked ones", () => {
    const ids = rankByEngagement([
      row("quiet-1", 0, { viewers: MIN_VIEWERS - 1 }),
      row("popular", 5, { viewers: 20 }),
      row("new-work", 2), // no data yet: must not be ranked below by accident of noise
      row("quiet-2", 1, { viewers: 1, clickers: 1 }),
    ]);
    expect(ids).toEqual(["popular", "quiet-1", "quiet-2", "new-work"]);
  });

  it("keeps sold-out work after everything for sale, however popular", () => {
    const ids = rankByEngagement([
      row("sold", 0, { soldOut: true, viewers: 50 }),
      row("for-sale", 1, { viewers: 3 }),
    ]);
    expect(ids).toEqual(["for-sale", "sold"]);
  });

  it("breaks a tie by the current order, so reruns are stable", () => {
    const rows = [row("b", 1, { viewers: 5 }), row("a", 0, { viewers: 5 })];
    expect(rankByEngagement(rows)).toEqual(["a", "b"]);
    expect(rankByEngagement(rows)).toEqual(rankByEngagement([...rows].reverse()));
  });
});

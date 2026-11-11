import { describe, it, expect } from "vitest";
import {
  parseUserAgent,
  isBot,
  pctChange,
  isoDay,
  fillDailySeries,
  isVisitorId,
  withViewsTrend,
  TREND_DAYS,
} from "../lib/analytics";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  ipad:
    "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/604.1",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  winEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  winFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  googlebot:
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  curl: "curl/8.4.0",
};

describe("parseUserAgent: device", () => {
  it("detects mobile", () => {
    expect(parseUserAgent(UA.iphone).device).toBe("mobile");
    expect(parseUserAgent(UA.androidPhone).device).toBe("mobile");
  });
  it("detects tablet", () => {
    expect(parseUserAgent(UA.ipad).device).toBe("tablet");
    expect(parseUserAgent(UA.androidTablet).device).toBe("tablet");
  });
  it("defaults to desktop", () => {
    expect(parseUserAgent(UA.macChrome).device).toBe("desktop");
    expect(parseUserAgent(UA.winEdge).device).toBe("desktop");
  });
});

describe("parseUserAgent: browser", () => {
  it("identifies browsers, preferring specific tokens", () => {
    expect(parseUserAgent(UA.winEdge).browser).toBe("Edge");
    expect(parseUserAgent(UA.winFirefox).browser).toBe("Firefox");
    expect(parseUserAgent(UA.macChrome).browser).toBe("Chrome");
    expect(parseUserAgent(UA.macSafari).browser).toBe("Safari");
    expect(parseUserAgent(UA.iphone).browser).toBe("Safari");
  });
});

describe("parseUserAgent: os", () => {
  it("identifies operating systems", () => {
    expect(parseUserAgent(UA.iphone).os).toBe("iOS");
    expect(parseUserAgent(UA.androidPhone).os).toBe("Android");
    expect(parseUserAgent(UA.macChrome).os).toBe("macOS");
    expect(parseUserAgent(UA.winFirefox).os).toBe("Windows");
  });
});

describe("isBot", () => {
  it("flags crawlers and tooling", () => {
    expect(isBot(UA.googlebot)).toBe(true);
    expect(isBot(UA.curl)).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(null)).toBe(true);
  });
  it("passes real browsers", () => {
    expect(isBot(UA.iphone)).toBe(false);
    expect(isBot(UA.macChrome)).toBe(false);
    expect(isBot(UA.winEdge)).toBe(false);
  });
});

describe("pctChange", () => {
  it("formats a positive change with leading + and up = true", () => {
    expect(pctChange(120, 100)).toEqual({ text: "+20%", up: true });
  });
  it("formats a negative change with the minus sign and up = false", () => {
    expect(pctChange(80, 100)).toEqual({ text: "-20%", up: false });
  });
  it("treats no change as neither up nor down (null)", () => {
    expect(pctChange(100, 100)).toEqual({ text: "0%", up: null });
  });
  it("labels a brand-new period 'new' when previous was 0 and current > 0", () => {
    expect(pctChange(5, 0)).toEqual({ text: "new", up: true });
  });
  it("returns n/a when both periods are 0 (no signal)", () => {
    expect(pctChange(0, 0)).toEqual({ text: "n/a", up: null });
  });
  it("rounds fractional percents to the nearest whole number", () => {
    // (101-100)/100 = 1%, rounded; (149-100)/100 = 49%
    expect(pctChange(101, 100).text).toBe("+1%");
    expect(pctChange(149, 100).text).toBe("+49%");
  });
});

describe("isoDay", () => {
  it("returns YYYY-MM-DD in UTC", () => {
    expect(isoDay(new Date("2026-06-05T17:30:00Z"))).toBe("2026-06-05");
    expect(isoDay(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
  });
});

describe("fillDailySeries", () => {
  const start = new Date("2026-06-01T00:00:00Z");

  it("emits exactly `days` buckets even when input is empty", () => {
    const out = fillDailySeries([], start, 7);
    expect(out).toHaveLength(7);
    expect(out.every((p) => p.views === 0 && p.visitors === 0)).toBe(true);
    expect(out[0]!.date).toBe("2026-06-01");
    expect(out[6]!.date).toBe("2026-06-07");
  });

  it("merges sparse server rows into the dense series", () => {
    const out = fillDailySeries(
      [
        { day: new Date("2026-06-02T12:00:00Z"), views: 10, visitors: 4 },
        { day: new Date("2026-06-05T08:00:00Z"), views: 7, visitors: 3 },
      ],
      start,
      7
    );
    expect(out.map((p) => p.views)).toEqual([0, 10, 0, 0, 7, 0, 0]);
    expect(out.map((p) => p.visitors)).toEqual([0, 4, 0, 0, 3, 0, 0]);
  });

  it("coerces string-y counts coming back from $queryRaw to numbers", () => {
    // Some Postgres drivers return COUNT(*) as bigint/string. We rely on Number().
    const out = fillDailySeries(
      // @ts-expect-error — exercise the runtime coercion path
      [{ day: new Date("2026-06-01T00:00:00Z"), views: "12", visitors: "5" }],
      start,
      3
    );
    expect(out[0]).toEqual({ date: "2026-06-01", views: 12, visitors: 5 });
  });

  it("handles a 90-day range without gaps", () => {
    const out = fillDailySeries([], start, 90);
    expect(out).toHaveLength(90);
    // last bucket is start + 89 days
    expect(out[89]!.date).toBe("2026-08-29");
  });
});

describe("isVisitorId", () => {
  it("accepts the UUIDs the site sets", () => {
    expect(isVisitorId("3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b")).toBe(true);
  });

  it("refuses anything else: missing, short, long, or with other characters", () => {
    for (const v of [undefined, "", "short", "x".repeat(65), "<script>alert(1)</script>", "a b c d e f g h", "id;drop"]) {
      expect(isVisitorId(v)).toBe(false);
    }
  });
});

// ── The dashboard's moving average ─────────────────────────────────────────────

describe("withViewsTrend", () => {
  const series = (views: number[]) =>
    views.map((v, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, views: v, visitors: 0 }));

  it("averages each day with the six before it, using the lead-in days, then drops them", () => {
    // Six lead-in days of 7 views, then a range of 0, 14, 0.
    const out = withViewsTrend(series([7, 7, 7, 7, 7, 7, 0, 14, 0]), TREND_DAYS - 1);
    expect(out.map((p) => p.date)).toEqual(["2026-01-07", "2026-01-08", "2026-01-09"]);
    expect(out.map((p) => p.viewsTrend)).toEqual([42 / 7, 49 / 7, 42 / 7]);
  });

  it("doesn't dip toward zero at the start of a range that has a lead-in", () => {
    const out = withViewsTrend(series([10, 10, 10, 10, 10, 10, 10]), 6);
    expect(out[0]?.viewsTrend).toBe(10);
  });

  it("averages only the days that exist at the very start of the data (all time)", () => {
    const out = withViewsTrend(series([4, 8, 0]), 0);
    expect(out.map((p) => p.viewsTrend)).toEqual([4, 6, 4]);
  });

  it("keeps the raw daily values untouched", () => {
    const out = withViewsTrend(series([1, 2, 3]), 0);
    expect(out.map((p) => p.views)).toEqual([1, 2, 3]);
  });
});

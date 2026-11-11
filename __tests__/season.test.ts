import { describe, it, expect } from "vitest";
import { currentSeason } from "../lib/season";

// currentSeason uses date.getMonth() (local time), so construct dates with the
// local constructor form (month is 0-indexed) to keep these assertions
// timezone-independent. Parsing "2026-06-01" would be UTC midnight, which lands
// on the previous day's month in UTC-offset zones and breaks the boundaries.
describe("currentSeason", () => {
  it("maps spring months", () => {
    expect(currentSeason(new Date(2026, 2, 15))).toBe("Spring");
    expect(currentSeason(new Date(2026, 4, 31))).toBe("Spring");
  });

  it("maps summer months", () => {
    expect(currentSeason(new Date(2026, 5, 1))).toBe("Summer");
    expect(currentSeason(new Date(2026, 7, 20))).toBe("Summer");
  });

  it("maps fall months", () => {
    expect(currentSeason(new Date(2026, 8, 10))).toBe("Fall");
    expect(currentSeason(new Date(2026, 10, 30))).toBe("Fall");
  });

  it("maps winter months", () => {
    expect(currentSeason(new Date(2026, 11, 25))).toBe("Winter");
    expect(currentSeason(new Date(2026, 0, 15))).toBe("Winter");
    expect(currentSeason(new Date(2026, 1, 28))).toBe("Winter");
  });
});

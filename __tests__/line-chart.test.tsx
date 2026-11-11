import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import LineChart from "@/components/charts/LineChart";

// The analytics chart draws the 7-day average only when it's given one, and
// labels it, so a reader knows which line is the smoothed one.
describe("LineChart", () => {
  afterEach(cleanup);

  const days = [3, 9, 1, 12].map((v, i) => ({ date: `2026-10-0${i + 1}`, views: v, visitors: 1 }));

  it("draws and labels the 7-day average when the data has it", () => {
    const { container, getByText } = render(
      <LineChart data={days.map((d) => ({ ...d, viewsTrend: 6 }))} />
    );
    expect(container.querySelector('[data-series="views-trend"]')).not.toBeNull();
    expect(getByText(/7-day average/)).toBeTruthy();
  });

  it("draws no average line without trend data", () => {
    const { container, queryByText } = render(<LineChart data={days} />);
    expect(container.querySelector('[data-series="views-trend"]')).toBeNull();
    expect(queryByText(/7-day average/)).toBeNull();
  });
});

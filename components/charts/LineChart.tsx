// Dependency-free SVG line/area chart: daily page views and unique visitors,
// with the 7-day average of page views drawn over them when the data has it
// (viewsTrend, from withViewsTrend in lib/analytics.ts). The daily line is
// faded so the average reads first; the noise is still there to see.
// Purely presentational — receives already-bucketed daily data.

import type { DailyPoint } from "@/lib/analytics";
import { TREND_DAYS } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";

export type { DailyPoint };

/** The dashboard's terracotta (its Visitor actions bars): apart from the green and blue. */
const TREND_COLOUR = "#c2705a";

export default function LineChart({ data }: { data: DailyPoint[] }) {
  const W = 760;
  const H = 240;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-60 text-sm text-gray-400">
        No data yet for this period.
      </div>
    );
  }

  const maxY = Math.max(1, ...data.map((d) => Math.max(d.views, d.visitors)));
  const n = data.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxY) * innerH;

  const linePath = (key: "views" | "visitors") =>
    data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(" ");

  const hasTrend = data.some((d) => d.viewsTrend !== undefined);
  const trendPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.viewsTrend ?? d.views).toFixed(1)}`)
    .join(" ");

  const areaPath =
    `M ${x(0).toFixed(1)} ${y(data[0]?.views ?? 0).toFixed(1)} ` +
    data.map((d, i) => `L ${x(i).toFixed(1)} ${y(d.views).toFixed(1)}`).join(" ") +
    ` L ${x(n - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  // Y gridlines (4 steps). When maxY is small (e.g. 1 or 2) the rounded values
  // collide — so render them indexed and skip the label if it repeats the one
  // above it.
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => ({
    i,
    raw: (maxY / ticks) * i,
    value: Math.round((maxY / ticks) * i),
  }));

  // X labels — show ~6 evenly spaced dates
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Visits over time">
        {/* gridlines + y labels */}
        {yTicks.map((t, idx) => {
          const prev = yTicks[idx - 1]?.value ?? null;
          const showLabel = prev === null || prev !== t.value;
          return (
            <g key={t.i}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y(t.raw)}
                y2={y(t.raw)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              {showLabel && (
                <text x={padL - 6} y={y(t.raw) + 3} textAnchor="end" fontSize={10} fill="#9ca3af">
                  {t.value}
                </text>
              )}
            </g>
          );
        })}

        {/* views area + line */}
        <path d={areaPath} fill={BRAND.green} opacity={hasTrend ? 0.08 : 0.12} />
        <path
          d={linePath("views")}
          fill="none"
          stroke={BRAND.green}
          strokeWidth={hasTrend ? 1.25 : 2}
          opacity={hasTrend ? 0.55 : 1}
        />
        {/* visitors line */}
        <path d={linePath("visitors")} fill="none" stroke="#7c9cf5" strokeWidth={1.5} strokeDasharray="4 3" />
        {/* 7-day average of page views, on top */}
        {hasTrend && (
          <path
            d={trendPath}
            fill="none"
            stroke={TREND_COLOUR}
            strokeWidth={3}
            strokeLinejoin="round"
            strokeLinecap="round"
            data-series="views-trend"
          />
        )}

        {/* x labels */}
        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#9ca3af">
              {fmt(d.date)}
            </text>
          ) : null
        )}
      </svg>

      <div className="flex gap-5 text-xs text-gray-500 mt-1 pl-9">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-brand" /> Page views
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5" style={{ background: "#7c9cf5" }} /> Unique visitors
        </span>
        {hasTrend && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-1 rounded-full" style={{ background: TREND_COLOUR }} />{" "}
            Page views, {TREND_DAYS}-day average
          </span>
        )}
      </div>
    </div>
  );
}

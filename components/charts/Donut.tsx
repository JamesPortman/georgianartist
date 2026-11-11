// Dependency-free SVG donut chart — for device / browser splits.

import { BRAND } from "@/lib/brand";

export interface DonutSlice {
  label: string;
  value: number;
}

const PALETTE = [BRAND.green, "#7c9cf5", "#e0a93b", "#c2705a", "#8a8d91"];

export default function Donut({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">No data yet.</p>;
  }

  const R = 60;
  const stroke = 22;
  const C = 2 * Math.PI * R;

  // Pre-compute each slice's arc length + cumulative offset so we never mutate
  // during render (keeps react-hooks/immutability happy).
  const segments = slices.reduce<{ label: string; dash: number; offset: number; color: string }[]>(
    (acc, s, i) => {
      const dash = (s.value / total) * C;
      const prev = acc.at(-1);
      const offset = prev ? prev.offset + prev.dash : 0;
      acc.push({ label: s.label, dash, offset, color: PALETTE[i % PALETTE.length] ?? BRAND.green });
      return acc;
    },
    []
  );

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" className="w-32 h-32 shrink-0" role="img" aria-label="Device split">
        <g transform="translate(70,70) rotate(-90)">
          {segments.map((seg) => (
            <circle
              key={seg.label}
              r={R}
              cx={0}
              cy={0}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${seg.dash} ${C - seg.dash}`}
              strokeDashoffset={-seg.offset}
            />
          ))}
        </g>
      </svg>

      <ul className="space-y-1.5">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="text-gray-700 capitalize">{s.label}</span>
            <span className="text-gray-400 tabular-nums">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

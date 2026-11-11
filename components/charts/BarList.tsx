// Dependency-free horizontal bar list — for top pages, products, actions,
// referrers, countries. Each row shows a label, a proportional bar, and a count.

import { BRAND } from "@/lib/brand";

export interface BarItem {
  label: string;
  value: number;
  /** Optional secondary label shown muted to the right of the main label. */
  sub?: string;
}

export default function BarList({
  items,
  emptyText = "No data yet.",
  color = BRAND.green,
}: {
  items: BarItem[];
  emptyText?: string;
  color?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">{emptyText}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={`${item.label}-${idx}`}>
          <div className="flex items-baseline justify-between gap-3 mb-0.5">
            <span className="text-sm text-gray-700 truncate" title={item.label}>
              {item.label}
              {item.sub && <span className="text-gray-400 ml-1.5 text-xs">{item.sub}</span>}
            </span>
            <span className="text-sm font-medium text-gray-900 tabular-nums shrink-0">
              {item.value.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(item.value / max) * 100}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

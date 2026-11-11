"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import LineChart from "@/components/charts/LineChart";
import BarList, { type BarItem } from "@/components/charts/BarList";
import Donut from "@/components/charts/Donut";
import { pctChange, type DailyPoint } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";

interface Summary {
  pageviews: number;
  prevPageviews: number;
  uniqueVisitors: number;
  prevUnique: number;
  actions: number;
  prevActions: number;
}

interface RecentEvent {
  id: string;
  createdAt: string;
  kind: string;
  action: string | null;
  path: string;
  product: string | null;
  device: string;
  browser: string | null;
  country: string | null;
  city: string | null;
}

interface Props {
  range: number | "all";
  /** First day shown, YYYY-MM-DD (the first recorded event, for "all"). */
  since: string;
  /** False for "all": there is no previous period to compare with. */
  compare: boolean;
  summary: Summary;
  daily: DailyPoint[];
  topPages: BarItem[];
  topProducts: BarItem[];
  actionBreakdown: BarItem[];
  devices: BarItem[];
  browsers: BarItem[];
  referrers: BarItem[];
  countries: BarItem[];
  recentEvents: RecentEvent[];
}

const RANGES: (number | "all")[] = [7, 30, 90, "all"];

function Card({ label, value, prev }: { label: string; value: number; prev: number | null }) {
  const d = prev === null ? null : pctChange(value, prev);
  const color = !d || d.up === null ? "text-gray-400" : d.up ? "text-green-600" : "text-red-500";
  const arrow = !d || d.up === null ? "" : d.up ? "▲" : "▼";
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value.toLocaleString()}</p>
      {d && (
        <p className={`text-xs mt-1 ${color}`}>
          {arrow} {d.text} <span className="text-gray-400">vs previous period</span>
        </p>
      )}
    </div>
  );
}

/** "2026-05-25" -> "25 May 2026" */
function longDate(iso: string) {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function AnalyticsClient({
  range,
  since,
  compare,
  summary,
  daily,
  topPages,
  topProducts,
  actionBreakdown,
  devices,
  browsers,
  referrers,
  countries,
  recentEvents,
}: Props) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);

  function setRange(r: number | "all") {
    router.push(`/admin/analytics?range=${r}`);
  }

  const visibleEvents = showAll ? recentEvents : recentEvents.slice(0, 15);

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Site Analytics</h1>
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 transition-colors ${
                r === range
                  ? "bg-brand text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {r === "all" ? "All" : `${r}d`}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card label="Page views" value={summary.pageviews} prev={compare ? summary.prevPageviews : null} />
        <Card label="Unique visitors" value={summary.uniqueVisitors} prev={compare ? summary.prevUnique : null} />
        <Card label="Actions" value={summary.actions} prev={compare ? summary.prevActions : null} />
      </div>

      {/* Time series */}
      <Panel title={range === "all" ? `Visits since ${longDate(since)}` : `Visits over the last ${range} days`}>
        <LineChart data={daily} />
      </Panel>

      {/* Two-column breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Top pages">
          <BarList items={topPages} />
        </Panel>
        <Panel title="Most viewed artwork">
          <BarList items={topProducts} emptyText="No product views yet." />
        </Panel>
        <Panel title="Visitor actions">
          <BarList items={actionBreakdown} color="#c2705a" emptyText="No actions recorded yet." />
        </Panel>
        <Panel title="Devices">
          <Donut slices={devices} />
          {browsers.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-medium text-gray-500 mb-2">Browsers</p>
              <BarList items={browsers} color="#7c9cf5" />
            </div>
          )}
        </Panel>
        <Panel title="Top referrers">
          <BarList items={referrers} color="#e0a93b" emptyText="No external referrers yet." />
        </Panel>
        <Panel title="Top countries">
          <BarList items={countries} color={BRAND.green} emptyText="No geo data yet." />
        </Panel>
      </div>

      {/* Detail table */}
      <Panel title="Recent activity">
        {recentEvents.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No activity yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-200">
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">Page</th>
                    <th className="py-2 pr-3 font-medium">Device</th>
                    <th className="py-2 pr-3 font-medium">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-2 pr-3">
                        {e.action ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-brand-tint text-brand text-xs font-medium">
                            {e.action}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">page view</span>
                        )}
                        {e.product && <span className="text-gray-500 text-xs ml-1.5">{e.product}</span>}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 max-w-[220px] truncate" title={e.path}>
                        {e.path}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 capitalize whitespace-nowrap">
                        {e.device}
                        {e.browser && <span className="text-gray-400"> · {e.browser}</span>}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                        {[e.city, e.country].filter(Boolean).join(", ") || "unknown"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recentEvents.length > 15 && (
              <button
                onClick={() => setShowAll((s) => !s)}
                className="mt-3 text-sm text-brand hover:underline"
              >
                {showAll ? "Show less" : `Show all ${recentEvents.length}`}
              </button>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

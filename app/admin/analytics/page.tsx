import { requireAuth } from "@/app/actions/admin";
import { logoutAction } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import Link from "next/link";
import AnalyticsClient from "./AnalyticsClient";
import ExcludeBrowser from "./ExcludeBrowser";
import { getExclusionsAction } from "@/app/actions/analytics";
import { fillDailySeries, TREND_DAYS, withViewsTrend } from "@/lib/analytics";
import { siteConfig } from "@/data/siteConfig";

export const metadata = { title: "Analytics | Admin" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;
/** A number of days, or everything since the first recorded event. */
type Range = (typeof RANGES)[number] | "all";
const DAY_MS = 24 * 60 * 60 * 1000;

const ACTION_LABELS: Record<string, string> = {
  buy_open: "Buy Now opened",
  buy_submit: "Enquiry submitted",
  contact_submit: "Contact form sent",
  // Honeypot and too-fast submissions on the contact, Buy Now and booking forms.
  spam_blocked: "Spam blocked",
  // Kit accepted the address; double opt-in means it isn't confirmed yet.
  newsletter_submit: "Newsletter sign-up",
  // A click on the mailto link: an intent, not a sent email.
  soldout_enquiry: "Asked about a sold-out work",
  product_click: "Product clicked",
  outbound_click: "Outbound link",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAuth();

  const sp = await searchParams;
  const range: Range =
    sp.range === "all"
      ? "all"
      : RANGES.includes(Number(sp.range) as (typeof RANGES)[number])
        ? (Number(sp.range) as Range)
        : 30;

  const now = new Date();
  let start: Date;
  let days: number;
  if (range === "all") {
    // From the first recorded event, at midnight UTC. Events older than 25
    // months are pruned (app/api/cron/prune-analytics), so "all" means that far.
    const first = await prisma.analyticsEvent.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const t = first?.createdAt ?? now;
    start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
    days = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / DAY_MS));
  } else {
    start = new Date(now.getTime() - range * DAY_MS);
    days = range;
  }
  // "All time" has no previous period: an empty window, and no comparison shown.
  const compare = range !== "all";
  const prevStart = compare ? new Date(start.getTime() - days * DAY_MS) : start;

  const cur = { gte: start, lt: now };
  const prev = { gte: prevStart, lt: start };

  // The moving average needs the six days before the range, so its first days
  // average a real week (lib/analytics.ts withViewsTrend). "All" has none.
  const lead = compare ? TREND_DAYS - 1 : 0;
  const seriesStart = new Date(start.getTime() - lead * DAY_MS);

  const [
    pageviews,
    prevPageviews,
    actions,
    prevActions,
    uniqueRows,
    prevUniqueRows,
    dailyRows,
    topPagesRaw,
    actionRows,
    deviceRows,
    browserRows,
    referrerRows,
    countryRows,
    productPageRows,
    recent,
    products,
  ] = await Promise.all([
    prisma.analyticsEvent.count({ where: { kind: "pageview", createdAt: cur } }),
    prisma.analyticsEvent.count({ where: { kind: "pageview", createdAt: prev } }),
    prisma.analyticsEvent.count({ where: { kind: "action", createdAt: cur } }),
    prisma.analyticsEvent.count({ where: { kind: "action", createdAt: prev } }),
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT "visitorId")::int AS count
      FROM "AnalyticsEvent" WHERE "createdAt" >= ${start} AND "createdAt" < ${now}`,
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(DISTINCT "visitorId")::int AS count
      FROM "AnalyticsEvent" WHERE "createdAt" >= ${prevStart} AND "createdAt" < ${start}`,
    prisma.$queryRaw<{ day: Date; views: number; visitors: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*) FILTER (WHERE kind = 'pageview')::int AS views,
             COUNT(DISTINCT "visitorId")::int AS visitors
      FROM "AnalyticsEvent"
      WHERE "createdAt" >= ${seriesStart} AND "createdAt" < ${now}
      GROUP BY 1 ORDER BY 1`,
    prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: { kind: "pageview", createdAt: cur },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 12,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["action"],
      where: { kind: "action", createdAt: cur },
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["device"],
      where: { kind: "pageview", createdAt: cur },
      _count: { _all: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["browser"],
      where: { kind: "pageview", createdAt: cur },
      _count: { _all: true },
      orderBy: { _count: { browser: "desc" } },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["referrer"],
      where: { kind: "pageview", createdAt: cur, referrer: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 10,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["country"],
      where: { kind: "pageview", createdAt: cur, country: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 10,
    }),
    prisma.analyticsEvent.groupBy({
      by: ["path"],
      where: {
        kind: "pageview",
        createdAt: cur,
        OR: [{ path: { startsWith: "/products/" } }, { path: { startsWith: "/photographs/" } }],
      },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    prisma.analyticsEvent.findMany({
      where: { createdAt: cur },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.product.findMany({ select: { id: true, title: true } }),
  ]);

  const exclusions = await getExclusionsAction();

  const titleById = new Map(products.map((p) => [p.id, p.title]));
  const idFromPath = (p: string) => p.split("/").filter(Boolean).pop() ?? p;

  const daily = withViewsTrend(fillDailySeries(dailyRows, seriesStart, days + lead), lead);

  const uniqueVisitors = Number(uniqueRows[0]?.count ?? 0);
  const prevUnique = Number(prevUniqueRows[0]?.count ?? 0);

  const topPages = topPagesRaw.map((r) => ({ label: r.path, value: r._count._all }));

  const topProducts = productPageRows.map((r) => {
    const id = idFromPath(r.path);
    const isPhoto = r.path.startsWith("/photographs/");
    return {
      label: titleById.get(id) ?? id,
      sub: isPhoto ? "photo" : "painting",
      value: r._count._all,
    };
  });

  const actionBreakdown = actionRows.map((r) => ({
    label: ACTION_LABELS[r.action ?? ""] ?? r.action ?? "unknown",
    value: r._count._all,
  }));

  const devices = deviceRows.map((r) => ({ label: r.device, value: r._count._all }));
  const browsers = browserRows.map((r) => ({ label: r.browser ?? "Other", value: r._count._all }));

  const referrers = referrerRows.map((r) => {
    let host = r.referrer ?? "";
    try {
      host = new URL(r.referrer!).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    return { label: host || "(direct)", value: r._count._all };
  });

  const countries = countryRows.map((r) => ({ label: r.country ?? "(unknown)", value: r._count._all }));

  const recentEvents = recent.map((e) => ({
    id: e.id,
    createdAt: e.createdAt.toISOString(),
    kind: e.kind,
    action: e.action ? ACTION_LABELS[e.action] ?? e.action : null,
    path: e.path,
    product: e.productId ? titleById.get(e.productId) ?? e.productId : null,
    device: e.device,
    browser: e.browser,
    country: e.country,
    city: e.city,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-brand text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">{siteConfig.brand} · Admin</h1>
          <nav className="hidden sm:flex gap-4 text-sm text-white/80">
            <Link href="/admin/products" className="hover:text-white">Products</Link>
            <Link href="/admin/instagram" className="hover:text-white">Instagram</Link>
            <span className="text-white font-medium">Analytics</span>
            <Link href="/admin/security" className="hover:text-white">Security</Link>
          </nav>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-white/80 hover:text-white underline">Sign out</button>
        </form>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <AnalyticsClient
          range={range}
          since={start.toISOString().slice(0, 10)}
          compare={compare}
          summary={{
            pageviews,
            prevPageviews,
            uniqueVisitors,
            prevUnique,
            actions,
            prevActions,
          }}
          daily={daily}
          topPages={topPages}
          topProducts={topProducts}
          actionBreakdown={actionBreakdown}
          devices={devices}
          browsers={browsers}
          referrers={referrers}
          countries={countries}
          recentEvents={recentEvents}
        />
        <ExcludeBrowser rows={exclusions} />
      </main>
    </div>
  );
}

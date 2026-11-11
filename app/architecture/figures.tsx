/**
 * The diagrams that open the /architecture sections. Each states facts the
 * section's text also states (schedules from vercel.json and the workflows,
 * tables from prisma/schema.prisma, scores from the last full mutation run), so
 * when one of those changes, the figure here changes with it.
 *
 * Plain HTML and inline SVG, no images: they stay sharp, take the brand colour
 * from the @theme tokens (fill-brand, text-brand), and are read by screen
 * readers through their labels and the tables behind the charts.
 */

/* ── Shared pieces ──────────────────────────────────────────────────────────── */

function Figure({ label, caption, children }: { label: string; caption: string; children: React.ReactNode }) {
  return (
    <figure aria-label={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5 not-prose">
      {children}
      <figcaption className="mt-3 text-xs text-gray-600 leading-snug">{caption}</figcaption>
    </figure>
  );
}

function Box({ title, sub, tone = "plain" }: { title: string; sub?: string; tone?: "plain" | "tint" | "solid" }) {
  const shell =
    tone === "solid"
      ? "bg-brand border-brand text-white"
      : tone === "tint"
        ? "bg-brand-tint border-brand/40 text-gray-800"
        : "bg-white border-gray-300 text-gray-800";
  return (
    <div className={`flex-1 rounded-md border px-3 py-2 ${shell}`}>
      <p className="text-sm font-semibold leading-snug">{title}</p>
      {sub && <p className={`text-xs mt-0.5 leading-snug ${tone === "solid" ? "text-white" : "text-gray-600"}`}>{sub}</p>}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div aria-hidden="true" className="flex sm:flex-col items-center justify-center gap-1 px-1 text-gray-500">
      <span className="hidden sm:block leading-none">→</span>
      <span className="sm:hidden leading-none">↓</span>
      {label && <span className="text-[11px] leading-tight text-gray-600 sm:text-center sm:max-w-[7rem]">{label}</span>}
    </div>
  );
}

const Down = () => (
  <p aria-hidden="true" className="text-center text-gray-500 leading-none py-1.5">
    ↓
  </p>
);

/**
 * A box a wide chart scrolls sideways in on a phone. Focusable and labelled,
 * so a keyboard can scroll it too (axe: scrollable-region-focusable); relative,
 * so absolutely positioned screen-reader text stays inside it.
 */
function ScrollBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="relative overflow-x-auto rounded focus-visible:outline-2 focus-visible:outline-brand">
      {children}
    </div>
  );
}

/* ── §1 · System map ───────────────────────────────────────────────────────── */

export function SystemMap() {
  const services: [string, string][] = [
    ["Neon Postgres", "catalogue, Instagram queue, analytics"],
    ["Vercel Blob", "images, films, private backups"],
    ["Resend", "enquiry and alert email"],
    ["Anthropic API", "Instagram caption drafts"],
    ["Meta Graph API", "Instagram publishing"],
    ["GA4", "traffic, alongside the site’s own analytics"],
  ];
  return (
    <Figure
      label="System map"
      caption="Every request reaches one Next.js app on Vercel; everything it keeps or sends goes to one of six services."
    >
      <div className="flex flex-col sm:flex-row items-stretch gap-1.5">
        <Box title="Visitor" sub="any browser" />
        <Arrow />
        <Box title="Vercel" sub="CDN · functions · cron" tone="tint" />
        <Arrow />
        <Box title="Next.js 16 app" sub="pages, API routes, server actions" tone="solid" />
      </div>
      <Down />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {services.map(([t, s]) => (
          <Box key={t} title={t} sub={s} tone={t === "Anthropic API" ? "tint" : "plain"} />
        ))}
      </div>
    </Figure>
  );
}

/* ── §2 · A week of automation ─────────────────────────────────────────────── */

type Job = { name: string; when: string; marks: "band" | number[][] };

/** Hours are Eastern summer time; marks[d] lists the hours a job runs on day d (Mon = 0). */
const every = (hours: number[]) => Array.from({ length: 7 }, () => hours);
const only = (days: number[], hour: number) => Array.from({ length: 7 }, (_, d) => (days.includes(d) ? [hour] : []));

const WEEK: Job[] = [
  { name: "Health check", when: "every 10 min", marks: "band" },
  { name: "Catalogue snapshot", when: "every 6 h", marks: every([2, 8, 14, 20]) },
  { name: "Analytics prune", when: "daily, 1:30 am", marks: every([1.5]) },
  { name: "Instagram post", when: "Mon, Wed, Fri, 11 am", marks: only([0, 2, 4], 11) },
  { name: "Dependency updates", when: "Mondays (Dependabot)", marks: only([0], 12) },
  { name: "Mutation test, all modules", when: "Sundays, 3:17 am", marks: only([6], 3.3) },
  { name: "ZAP active scan", when: "Sundays, 4 am", marks: only([6], 4) },
];

export function WeekOfAutomation() {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const L = 210; // label column
  const dayW = 66;
  const rowH = 38;
  const top = 26;
  const W = L + dayW * 7 + 6;
  const H = top + rowH * WEEK.length + 4;
  const x = (d: number, h: number) => L + d * dayW + (h / 24) * dayW;
  return (
    <Figure
      label="A week of scheduled jobs"
      caption="Times are Eastern summer time (Vercel and GitHub schedule in UTC, so each is an hour earlier in winter). Pushes and deploys trigger the rest: CI on every pull request, a smoke test on every deploy."
    >
      <ScrollBox label="Weekly schedule chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px] h-auto" role="img" aria-labelledby="week-t">
          <title id="week-t">
            {WEEK.map((j) => `${j.name}: ${j.when}`).join("; ")}
          </title>
          {DAYS.map((d, i) => (
            <g key={d}>
              <rect x={L + i * dayW} y={top - 4} width={dayW} height={H - top} className={i % 2 ? "fill-white" : "fill-gray-100"} />
              <text x={L + i * dayW + dayW / 2} y={14} textAnchor="middle" className="fill-gray-700 text-[12px] font-semibold">
                {d}
              </text>
            </g>
          ))}
          {WEEK.map((j, r) => {
            const y = top + r * rowH + rowH / 2;
            return (
              <g key={j.name}>
                <text x={0} y={y - 3} className="fill-gray-800 text-[13px] font-semibold">
                  {j.name}
                </text>
                <text x={0} y={y + 12} className="fill-gray-600 text-[11px]">
                  {j.when}
                </text>
                {j.marks === "band" ? (
                  <rect x={L + 2} y={y - 3} width={dayW * 7 - 4} height={6} rx={3} className="fill-brand opacity-50" />
                ) : (
                  j.marks.flatMap((hours, d) =>
                    hours.map((h) => (
                      <circle key={`${d}-${h}`} cx={x(d, h)} cy={y} r={5.5} className="fill-brand stroke-white" strokeWidth={2} />
                    ))
                  )
                )}
              </g>
            );
          })}
        </svg>
      </ScrollBox>
    </Figure>
  );
}

/* ── §5 · How the tables relate ────────────────────────────────────────────── */

export function TableMap() {
  const linked: [string, string][] = [
    ["ProductSlug", "every URL a work has had; old ones redirect"],
    ["MakingOf", "the films; may arrive before their work"],
    ["InstagramPost", "the queue, captions and publish state"],
    ["AnalyticsEvent", "page views, some of them of a work"],
  ];
  const groups: [string, string[]][] = [
    ["Admin", ["AdminPasskey"]],
    ["Operations", ["HealthState", "FormRateLimit", "ErrorReport", "CspViolation"]],
    ["Analytics", ["ExcludedVisitor"]],
  ];
  return (
    <Figure
      label="How the tables relate"
      caption="Four tables point at a work by its productId, a plain column rather than a foreign key, so a film or a post can exist before its work does. The rest stand alone."
    >
      <div className="flex justify-center">
        <div className="w-full sm:w-80">
          <Box title="Product" sub="a work: painting or photograph, its prices, images and visibility" tone="solid" />
        </div>
      </div>
      <p aria-hidden="true" className="text-center text-[11px] text-gray-600 py-1.5">
        ↑ productId ↑
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {linked.map(([t, s]) => (
          <div key={t} className="rounded-md border border-brand/40 bg-white px-3 py-2">
            <p className="font-mono text-sm font-semibold text-brand">{t}</p>
            <p className="text-xs text-gray-600 mt-0.5 leading-snug">{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {groups.map(([g, tables]) => (
          <div key={g} className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">{g}</p>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-sm text-gray-800">
              {tables.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* ── §6 · Life of an Instagram post ───────────────────────────────────────── */

export function InstagramLifecycle() {
  const loops: [string, string, string][] = [
    ["approved", "pending", "its work was hidden, or the image changed since the caption was written"],
    ["posting", "approved", "the container failed, or Meta confirms it never went live"],
    ["posting", "posting", "Meta can’t say yet: the next run asks again"],
    ["pending", "skipped", "you skip it"],
  ];
  return (
    <Figure
      label="Life of an Instagram post"
      caption="A post is claimed into posting before anything irreversible, and its media container is recorded before publishing, so it can only ever go out once."
    >
      <div className="flex flex-col sm:flex-row items-stretch gap-1.5">
        <Box title="pending" sub="Claude drafts the caption" />
        <Arrow label="you approve; next Mon/Wed/Fri slot" />
        <Box title="approved" sub="scheduled" tone="tint" />
        <Arrow label="the cron claims it" />
        <Box title="posting" sub="container made, then published" tone="tint" />
        <Arrow label="Meta publishes" />
        <Box title="posted" sub="media id recorded" tone="solid" />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-600">It goes back when</p>
      <ul className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-2">
        {loops.map(([from, to, why]) => (
          <li key={from + to} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
            <span className="font-mono font-semibold text-gray-800">
              {from} → {to}
            </span>
            <span className="block text-xs text-gray-600 mt-0.5 leading-snug">{why}</span>
          </li>
        ))}
      </ul>
    </Figure>
  );
}

/* ── §7 · An image's journey ──────────────────────────────────────────────── */

export function ImageJourney() {
  const outcomes: [string, string, "solid" | "tint" | "plain"][] = [
    ["A visible work uses it", "served to anyone; cached up to 10 min", "solid"],
    ["The admin is signed in", "served, never cached", "tint"],
    ["Anything else", "404, and the store isn’t even read", "plain"],
  ];
  return (
    <Figure
      label="An uploaded image's journey"
      caption="Uploads live in the private store and are served only through /media, which decides per request. The backups in the same store are outside the folders it will serve."
    >
      <div className="flex flex-col sm:flex-row items-stretch gap-1.5">
        <Box title="Admin’s browser" sub="resized to 2400 px; HEIC becomes JPEG" />
        <Arrow />
        <Box title="Server action" sub="copyright notice stamped; collectors’ photos re-encoded without location" />
        <Arrow />
        <Box title="Private Blob store" sub="kept as a /media/… path on the row" tone="tint" />
      </div>
      <Down />
      <div className="rounded-md border border-brand/40 bg-white p-3">
        <p className="text-sm font-semibold text-gray-800">
          <span className="font-mono">/media</span> asks, on every request:
        </p>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {outcomes.map(([q, a, tone]) => (
            <Box key={q} title={q} sub={a} tone={tone} />
          ))}
        </div>
      </div>
      <Down />
      <div className="flex flex-col sm:flex-row items-stretch gap-1.5">
        <Box title="Image optimiser" sub="resized per screen, cached for hours" />
        <Arrow />
        <Box title="Visitor" sub="a picture sized for their device" />
      </div>
    </Figure>
  );
}

/* ── §8 · Layers of testing, and the mutation scores ──────────────────────── */

export function TestingLayers({ unit, e2e }: { unit: number; e2e: number }) {
  const layers: [string, string, string][] = [
    [`${unit} unit and component tests`, "Vitest", "every build and pull request"],
    [`${e2e} end-to-end tests, with axe`, "Playwright", "every pull request"],
    ["Static checks", "TypeScript, ESLint, audit-ci, Gitleaks, Semgrep", "every pull request"],
    ["Restore drill", "a snapshot restored and compared row by row", "every pull request"],
    ["1,108 planted bugs", "Stryker mutation testing", "pull requests touching guarded code; all, weekly"],
    ["Security scan", "OWASP ZAP, passive then active", "every merge; active weekly"],
    ["Smoke test", "the live site after each deploy", "every production deploy"],
  ];
  return (
    <Figure
      label="The layers of testing"
      caption="Each layer catches what the one before can’t: unit tests pin logic, end-to-end tests drive a real browser, scans look for known classes of flaw, and mutation testing checks the tests themselves."
    >
      <ol className="space-y-1.5">
        {layers.map(([what, how, when], i) => (
          <li
            key={what}
            className="grid grid-cols-1 sm:grid-cols-[1.7rem_1fr_1fr_1fr] items-center gap-x-3 gap-y-0.5 rounded-md border border-gray-300 bg-white px-3 py-2"
          >
            <span aria-hidden="true" className="hidden sm:flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span className="text-sm font-semibold text-gray-800">{what}</span>
            <span className="text-xs text-gray-600">{how}</span>
            <span className="text-xs font-semibold text-brand sm:text-right">{when}</span>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/**
 * From the full run on 7 October 2026 (stryker.config.mjs MODULES has the
 * floors); URL slugs and form input re-measured on 8 October, after tests
 * for their boundaries and messages; backups, the session cookie and the
 * database guard re-measured the same day, their floors raised to match.
 */
const SCORES: [string, number, number][] = [
  ["Backups", 100, 98],
  ["Session cookie", 100, 98],
  ["URL slugs", 100, 97],
  ["Order pricing", 99.4, 97],
  ["Instagram publishing", 98.8, 96],
  ["Form input limits", 95.5, 93],
  ["Sold-out rules", 95.3, 93],
  ["Passkey sign-in", 94.9, 92],
  ["/media route", 93.6, 91],
  ["Passkey rules", 93.1, 91],
  ["Private media store", 91.8, 89],
  ["Login lockout", 84.2, 82],
  ["Database guard", 77.7, 76],
  ["Old Squarespace URLs", 73.8, 71],
];

export function MutationScores() {
  const L = 170;
  const barW = 430;
  const rowH = 24;
  const top = 8;
  const W = L + barW + 56;
  const H = top + rowH * SCORES.length + 22;
  const x = (pct: number) => L + (pct / 100) * barW;
  return (
    <Figure
      label="Mutation score by module"
      caption="Share of planted bugs the tests catch, per module, from the full run of 7 October 2026 (URL slugs, form input, backups, the session cookie and the database guard re-measured on 8 October). The dark tick is the module’s floor: a pull request that leaves it below fails."
    >
      <ScrollBox label="Mutation score chart">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[560px] h-auto" aria-hidden="true">
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <line x1={x(p)} x2={x(p)} y1={top - 4} y2={H - 18} className="stroke-gray-200" strokeWidth={1} />
              <text x={x(p)} y={H - 4} textAnchor="middle" className="fill-gray-600 text-[11px]">
                {p}%
              </text>
            </g>
          ))}
          {SCORES.map(([name, score, floor], i) => {
            const y = top + i * rowH;
            return (
              <g key={name}>
                <text x={L - 10} y={y + 15} textAnchor="end" className="fill-gray-800 text-[12px]">
                  {name}
                </text>
                <rect x={L} y={y + 5} width={x(score) - L} height={13} rx={3} className="fill-brand" />
                <line x1={x(floor)} x2={x(floor)} y1={y + 2} y2={y + 21} className="stroke-gray-800" strokeWidth={2} />
                <text x={x(score) + 6} y={y + 15} className="fill-gray-800 text-[11px] font-semibold">
                  {score % 1 ? score.toFixed(1) : score}%
                </text>
              </g>
            );
          })}
        </svg>
      </ScrollBox>
      <table className="sr-only">
        <caption>Mutation score and floor by module</caption>
        <thead>
          <tr>
            <th scope="col">Module</th>
            <th scope="col">Score</th>
            <th scope="col">Floor</th>
          </tr>
        </thead>
        <tbody>
          {SCORES.map(([name, score, floor]) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{score}%</td>
              <td>{floor}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Figure>
  );
}

/* ── §9 · Defence in layers ───────────────────────────────────────────────── */

export function DefenceLayers() {
  const layers: [string, string[]][] = [
    ["Every response", ["HTTPS only", "security headers", "a Content-Security-Policy with a fresh nonce", "cron routes need a secret"]],
    ["The public site", ["prices set by the server", "forms rate-limited per address, recipient and day", "honeypots", "no IP addresses stored"]],
    ["The admin", ["passkey sign-in, bound to this domain", "at most five failed sign-ins per 15 minutes", "an encrypted 8-hour session", "every server action checks it"]],
    ["The data", ["only production may touch production’s database", "uploads private, served by /media", "backups in a private store", "secrets only in Vercel"]],
  ];
  return (
    <Figure
      label="Defence in layers"
      caption="Each ring assumes the one outside it might fail. What none of them covers: a compromised Vercel, GitHub or Neon account."
    >
      <div className="rounded-xl border border-gray-300 bg-white p-2 sm:p-3">
        {layers.reduceRight<React.ReactNode>(
          (inner, [name, items], i) => (
            <div
              className={`rounded-lg border p-2 sm:p-3 ${i === layers.length - 1 ? "border-brand bg-brand-tint" : i === 0 ? "border-transparent" : "border-brand/40 bg-white"}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">{name}</p>
              <p className="text-sm text-gray-700 mt-1 leading-snug">{items.join(" · ")}</p>
              {inner && <div className="mt-2">{inner}</div>}
            </div>
          ),
          null
        )}
      </div>
    </Figure>
  );
}

/* ── §10 · What checks what ───────────────────────────────────────────────── */

const TOOLS = ["Unit", "E2E", "ZAP", "Semgrep", "Gitleaks", "audit-ci", "Mutation"] as const;
type Tool = (typeof TOOLS)[number];

const RISKS: [string, Tool[]][] = [
  ["Script injection (XSS)", ["E2E", "ZAP", "Semgrep"]],
  ["SQL or command injection", ["ZAP", "Semgrep"]],
  ["Someone taking over the admin", ["Unit", "E2E", "Mutation"]],
  ["Forms used as a mail relay", ["Unit", "E2E", "Mutation"]],
  ["A price changed in the browser", ["Unit", "Mutation"]],
  ["An unpublished work leaking", ["Unit", "Mutation"]],
  ["Missing security headers", ["Unit", "E2E", "ZAP"]],
  ["A post going out twice", ["Unit", "Mutation"]],
  ["A backup that won’t restore", ["Unit", "Mutation"]],
  ["A secret committed to git", ["Gitleaks"]],
  ["A vulnerable dependency", ["audit-ci"]],
];

export function CoverageGrid() {
  return (
    <Figure
      label="Which check covers which risk"
      caption="Every risk has at least one automated check, most have two or more. Restores are also drilled on every pull request. Not done yet: a test by an outside tester, and a load test run to failure."
    >
      <ScrollBox label="Risks and the checks that cover them">
        <table className="w-full min-w-[560px] text-sm border-collapse">
          <thead>
            <tr className="text-gray-700">
              <th scope="col" className="py-1.5 pr-3 text-left font-semibold">
                Risk
              </th>
              {TOOLS.map((t) => (
                <th key={t} scope="col" className="py-1.5 px-1 text-center text-xs font-semibold">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RISKS.map(([risk, tools]) => (
              <tr key={risk} className="border-t border-gray-200">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-gray-800">
                  {risk}
                </th>
                {TOOLS.map((t) => (
                  <td key={t} className="py-1.5 px-1 text-center">
                    {tools.includes(t) ? (
                      <span className="inline-block h-3.5 w-3.5 rounded-full bg-brand align-middle">
                        <span className="sr-only">checked</span>
                      </span>
                    ) : (
                      <span className="sr-only">not checked</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollBox>
    </Figure>
  );
}

/* ── §12 · How far back ────────────────────────────────────────────────────── */

export function RecoveryLayers() {
  const W = 640;
  const L = 8;
  const R = W - 8;
  const span = 7 * 24; // hours shown: the last week
  const x = (hoursAgo: number) => R - (hoursAgo / span) * (R - L);
  const cards: [string, string, string][] = [
    ["Point-in-time restore", "Neon, the whole database, analytics included", "any second of the last 6 hours"],
    ["Snapshots", "catalogue, films’ rows, Instagram queue, old URLs; private store", "every 6 hours, kept a week; drilled"],
    ["The artwork", "images on Blob and in git history; films from their source files", "always"],
    ["Secrets", "Production’s variables, encrypted with age, kept off Vercel", "after any change; RUNBOOK.md for the rest"],
  ];
  return (
    <Figure
      label="How far back the site can be restored"
      caption="Neon’s free point-in-time window is only six hours, the thin band on the right; past it, the six-hourly snapshots are the way back, for a week."
    >
      <ScrollBox label="Restore window chart">
        <svg viewBox={`0 0 ${W} 74`} className="w-full min-w-[520px] h-auto" aria-hidden="true">
          <rect x={L} y={18} width={R - L} height={14} rx={3} className="fill-gray-200" />
          <rect x={x(6)} y={18} width={x(0) - x(6)} height={14} className="fill-brand" />
          {Array.from({ length: 28 }, (_, i) => (
            <line key={i} x1={x(i * 6)} x2={x(i * 6)} y1={36} y2={46} className="stroke-brand" strokeWidth={2} />
          ))}
          {[7, 6, 5, 4, 3, 2, 1].map((d) => (
            <text key={d} x={x(d * 24)} y={64} textAnchor={d === 7 ? "start" : "middle"} className="fill-gray-600 text-[11px]">
              {d === 7 ? "a week ago" : `${d} d`}
            </text>
          ))}
          <text x={R} y={64} textAnchor="end" className="fill-gray-800 text-[11px] font-semibold">
            now
          </text>
          <text x={x(6) - 6} y={13} textAnchor="end" className="fill-gray-800 text-[11px] font-semibold">
            point-in-time: 6 h
          </text>
          <text x={L} y={13} className="fill-gray-600 text-[11px]">
            ticks: a snapshot every 6 h
          </text>
        </svg>
      </ScrollBox>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cards.map(([t, what, when]) => (
          <div key={t} className="rounded-md border border-gray-300 bg-white px-3 py-2">
            <p className="text-sm font-semibold text-gray-800">{t}</p>
            <p className="text-xs text-gray-600 mt-0.5 leading-snug">{what}</p>
            <p className="text-xs font-semibold text-brand mt-1">{when}</p>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/* ── Step rows: a numbered sequence that runs across on a wide screen ────── */

function Steps({ steps }: { steps: [string, string][] }) {
  return (
    <ol className="flex flex-col sm:flex-row sm:items-stretch gap-2">
      {steps.map(([title, sub], i) => (
        <li key={title} className="flex flex-col sm:flex-row flex-1 gap-2">
          {i > 0 && <Arrow />}
          <div className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2">
            <p className="text-sm font-semibold text-gray-800 leading-snug">
              <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] text-white align-text-bottom">
                {i + 1}
              </span>
              {title}
            </p>
            <p className="text-xs text-gray-600 mt-1 leading-snug">{sub}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── §8 · What a mutant is ─────────────────────────────────────────────── */

export function MutationExplainer() {
  return (
    <Figure
      label="How mutation testing works"
      caption="Stryker repeats this once per mutant, over a thousand times across the guarded modules. A surviving mutant is a line no test would notice changing."
    >
      <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
        <Box title="The real code" sub="lib/form-input.ts: if (value.length > max) refuse" />
        <Arrow label="plant one small bug" />
        <Box title="A mutant" sub="if (value.length >= max) refuse" tone="tint" />
        <Arrow label="run the tests" />
        <div className="flex flex-1 flex-col gap-2">
          <Box title="Killed" sub="a test failed, so this bug would be caught" tone="solid" />
          <Box title="Survived" sub="every test passed: nothing pins this line yet" />
        </div>
      </div>
    </Figure>
  );
}

/* ── §9 · Passkey sign-in ──────────────────────────────────────────────── */

export function PasskeySignIn() {
  return (
    <Figure
      label="Admin sign-in with a passkey"
      caption="The private key never leaves the artist's device, and the server keeps only public keys, so there is no password to steal or phish. A signature made for another domain fails step 4."
    >
      <Steps
        steps={[
          ["Admin opens sign-in", "the browser asks the server to start"],
          ["Server sends a challenge", "one-time, short-lived, held in the encrypted session cookie"],
          ["Device signs it", "Touch ID, Face ID or a security key unlocks the passkey"],
          ["Server verifies", "against stored public keys; only this site's domain counts"],
          ["8-hour session", "an http-only, same-site, secure cookie"],
        ]}
      />
    </Figure>
  );
}

/* ── §10 · Who attacks the site, and when ──────────────────────────────── */

export function ScanSchedule() {
  const lanes: [string, [string, string][]][] = [
    [
      "Every push to main",
      [
        ["E2E suite passes", "the build under test is the real one"],
        ["ZAP baseline scan", "a spider crawls 1,000+ URLs; passive checks on every response"],
        ["Gate", "any untriaged finding fails the run and opens an issue"],
      ],
    ],
    [
      "Every Sunday",
      [
        ["Throwaway build", "its own database; production is never touched"],
        ["ZAP full and API scans", "injection, scripting, traversal on every page and form endpoint"],
        ["Gate", "findings fail the run and open an issue"],
      ],
    ],
    [
      "By hand, 11 Nov 2026",
      [
        ["Mozilla Observatory", "A+, 130/100, 12 of 12 tests"],
        ["SSL Labs", "A: TLS 1.3, post-quantum key exchange, CAA"],
        ["Email records", "SPF and DKIM pass; DMARC published"],
      ],
    ],
  ];
  return (
    <Figure
      label="Security scans and outside checks"
      caption="The automated scans run against builds of the site, never against production; the outside checks look at the live site the way any visitor's browser or mail server does."
    >
      <div className="space-y-4">
        {lanes.map(([lane, steps]) => (
          <div key={lane}>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-1.5">{lane}</p>
            <Steps steps={steps} />
          </div>
        ))}
      </div>
    </Figure>
  );
}

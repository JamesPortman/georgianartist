import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/data/siteConfig";
import inventory from "@/data/test-inventory.json";

/*
 * Every test by name. data/test-inventory.json is written by the production
 * build itself (scripts/test-inventory.mjs, straight after the unit suite), so
 * this page can't drift from the tests — and CI fails if the committed copy
 * is out of date.
 */

type Group = { file: string; tests: { name: string; skipped?: boolean }[] };
const unit = inventory.unit as Group[];
const e2e = inventory.e2e as Group[];
const count = (groups: Group[]) => groups.reduce((n, g) => n + g.tests.length, 0);

export const metadata: Metadata = {
  title: `Test inventory | ${siteConfig.brand}`,
  description: `Every automated test behind the site, by name: ${count(unit)} unit tests and ${count(e2e)} end-to-end tests, listed by the build that deployed this page.`,
  alternates: { canonical: "/architecture/tests" },
};

export default function TestInventoryPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <p className="text-sm mb-2">
        <Link href="/architecture" className="text-brand underline underline-offset-2 hover:no-underline">
          Architecture
        </Link>
      </p>
      <h1 className="text-3xl font-semibold text-gray-800 mb-2">Test inventory</h1>
      <p className="text-gray-600 text-lg mb-8">
        Every automated test behind this site, by name. The list is written by the same production
        build that deployed this page, so it can&rsquo;t fall out of date.
      </p>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        <Stat term="After each deploy" value="Smoke" note="the live site" />
        <Stat term="Security scan" value="ZAP" note="every push to main" />
        <Stat term="End-to-end tests" value={count(e2e)} note={`${e2e.length} specs`} />
        <Stat term="Unit tests" value={count(unit)} note={`${unit.length} files`} />
      </dl>

      <section aria-labelledby="beyond" className="mt-10">
        <h2 id="beyond" className="text-xl font-semibold text-gray-800 mb-3">
          Beyond the test suites
        </h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700">
          <li>
            <strong>Dependency audit</strong>: <Code>npm audit</Code>{" "}on production dependencies,
            the first step of every CI run.
          </li>
          <li>
            <strong>Static analysis</strong>: Gitleaks over every commit for credentials, and
            Semgrep over the source; both on every pull request.
          </li>
          <li>
            <strong>Security scan</strong>: the OWASP ZAP baseline scan of the CI build, after the
            end-to-end tests pass, on every push to main.
          </li>
          <li>
            <strong>Active scan</strong>, weekly: ZAP attacks a CI build, pages and JSON
            endpoints alike, with injection and scripting payloads.
          </li>
          <li>
            <strong>Smoke test</strong>: after every production deploy, confirms the new commit is
            the one live and that key pages render with their security headers.
          </li>
          <li>
            <strong>Health check</strong>: every hour, the database and four live pages;
            emails when that changes.
          </li>
          <li>
            <strong>Load test</strong>: a k6 script, run by hand; the latest results are in{" "}
            <Link href="/architecture#security-testing" className="text-brand underline underline-offset-2 hover:no-underline">
              Architecture §10
            </Link>
            .
          </li>
        </ul>
      </section>

      <Suite
        id="e2e"
        title="End-to-end tests"
        groups={e2e}
        intro={
          <>
            Playwright in Chromium, against a production build and a throwaway Postgres, on every
            pull request and every push to <Code>main</Code>. They include an axe accessibility
            scan of every public page type and a Content-Security-Policy check of every page.
            The image-upload test is opt-in and CI skips it, because it writes to the real image
            store. None of them runs against the live site: the suite refuses to start unless its
            database is local.
          </>
        }
      />

      <Suite
        id="unit"
        title="Unit and component tests"
        groups={unit}
        intro={
          <>
            Vitest, with Testing Library for components. They run on every pull request and again
            inside Vercel&rsquo;s production build, and a single failure stops the deploy, so
            every test below passed in the build that produced this page. Some are{" "}
            <em>source scans</em>: they read the code itself and fail on a hard-coded brand colour,
            a domain typed into a page, or image metadata in the bundle.
          </>
        }
      />
    </div>
  );
}

function Suite({
  id,
  title,
  groups,
  intro,
}: {
  id: string;
  title: string;
  groups: Group[];
  intro: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-xl font-semibold text-gray-800 mb-2">
        {title} <span className="text-gray-500 font-normal">({count(groups)})</span>
      </h2>
      <p className="text-gray-700 leading-relaxed mb-4">{intro}</p>
      <div className="divide-y divide-gray-200 border-y border-gray-200">
        {groups.map((g) => (
          <details key={g.file} className="group">
            <summary className="flex items-baseline justify-between gap-4 py-2 cursor-pointer text-sm">
              <Code>{g.file}</Code>
              <span className="text-gray-600 whitespace-nowrap">
                {g.tests.length} {g.tests.length === 1 ? "test" : "tests"}
              </span>
            </summary>
            <ul className="pb-3 pl-5 list-disc space-y-1 text-sm text-gray-700">
              {g.tests.map((t, i) => (
                <li key={i}>
                  {t.name}
                  {t.skipped && <span className="text-gray-600"> (skipped)</span>}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

function Stat({ term, value, note }: { term: string; value: string | number; note: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <dt className="text-xs uppercase tracking-wide text-gray-600">{term}</dt>
      <dd className="text-2xl font-semibold text-gray-800">{value}</dd>
      <dd className="text-xs text-gray-600">{note}</dd>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[0.85em] bg-gray-100 text-gray-800 rounded px-1 py-0.5">
      {children}
    </code>
  );
}

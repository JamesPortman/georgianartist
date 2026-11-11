#!/usr/bin/env node
/**
 * Post-deploy smoke test: is the commit that was just deployed actually live,
 * and does the live site work?
 *
 *   node scripts/smoke.mjs https://www.georgianartist.com [expected-commit]
 *
 * Run by .github/workflows/smoke.yml whenever Vercel reports a production
 * deploy, and runnable by hand. Plain Node, no dependencies, so CI needs no
 * `npm ci`. Read-only: GET requests only — no forms, nothing written, no
 * emails — and curl-like requests never reach the analytics.
 *
 * Why it exists: #190 merged green, its production build failed, and Vercel
 * kept serving the previous build. Every page returned 200 and nothing looked
 * wrong. So the first check is that /api/version reports the expected commit,
 * polled for a while because the domain moves to a new build a little after
 * Vercel reports it ready.
 *
 * If a newer deploy has already replaced the expected one, that's a pass: the
 * expected commit is superseded, not missing. Checking that needs the GitHub
 * API (GITHUB_TOKEN and GITHUB_REPOSITORY, both set in Actions).
 */

const [base, expected] = process.argv.slice(2);
if (!base) {
  console.error("Usage: node scripts/smoke.mjs <base-url> [expected-commit]");
  process.exit(2);
}

const UA = "GeorgianArtist-smoke/1 (post-deploy check)";
const results = [];
const record = (name, ok, detail = "") => results.push({ name, ok, detail });

async function get(path) {
  const res = await fetch(new URL(path, base), {
    headers: { "User-Agent": UA },
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  return { res, body: await res.text() };
}

// ── 1. The expected commit is live ──────────────────────────────────────────

async function liveCommit() {
  try {
    const { res, body } = await get("/api/version");
    return res.ok ? JSON.parse(body).commit : null;
  } catch {
    return null;
  }
}

async function supersedes(newer, older) {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  if (!token || !repo || !newer) return false;
  const res = await fetch(`https://api.github.com/repos/${repo}/compare/${older}...${newer}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  return res.ok && (await res.json()).status === "ahead";
}

if (expected) {
  const deadline = Date.now() + 3 * 60_000;
  let live = await liveCommit();
  while (live !== expected && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10_000));
    live = await liveCommit();
  }
  if (live === expected) record("live commit", true, expected.slice(0, 7));
  else if (await supersedes(live, expected))
    record("live commit", true, `${live.slice(0, 7)}, a newer deploy, already replaced ${expected.slice(0, 7)}`);
  else record("live commit", false, `expected ${expected.slice(0, 7)}, live is ${live ? live.slice(0, 7) : "unknown"}`);
}

// ── 2. The pages a visitor reaches ──────────────────────────────────────────

const sitemap = await get("/sitemap.xml").catch((e) => ({ res: null, body: "", error: e }));
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
record("sitemap.xml", sitemap.res?.status === 200 && locs.length >= 10, `${locs.length} URLs`);

const firstOf = (prefix) => locs.find((l) => l.startsWith(prefix));
const pages = [
  "/",
  "/photographs",
  firstOf("/products/"), // rendered from the database
  firstOf("/photographs/"),
  "/gift-shop",
  "/locations",
  "/making-of",
  "/contact",
  "/architecture",
].filter(Boolean);

for (const path of pages) {
  try {
    const { res, body } = await get(path);
    const h = res.headers;
    const csp = h.get("content-security-policy") ?? h.get("content-security-policy-report-only") ?? "";
    const problems = [
      res.status !== 200 && `HTTP ${res.status}`,
      // A 200 carrying an error shell is still an outage to a visitor.
      !body.includes("</nav>") && "didn't render the storefront",
      !csp.includes("'nonce-") && "no CSP nonce",
      h.get("x-frame-options") !== "DENY" && "no X-Frame-Options",
      h.get("cross-origin-opener-policy") !== "same-origin" && "no COOP",
    ].filter(Boolean);
    record(path, problems.length === 0, problems.join(", "));
  } catch (e) {
    record(path, false, e.message);
  }
}

try {
  // The endpoint the external uptime monitor watches: 200 means the database
  // answered through the deployed code.
  const { res, body } = await get("/api/health");
  record("/api/health", res.status === 200 && body === '{"ok":true}', `HTTP ${res.status}`);
} catch (e) {
  record("/api/health", false, e.message);
}

try {
  const { res, body } = await get("/robots.txt");
  record("robots.txt", res.status === 200 && body.includes("Sitemap:"));
} catch (e) {
  record("robots.txt", false, e.message);
}

// ── Report ──────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed against ${base}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [`### Smoke test: ${base}`, "", "| | Check | Detail |", "|---|---|---|",
      ...results.map((r) => `| ${r.ok ? "✅" : "❌"} | ${r.name} | ${r.detail} |`), ""].join("\n")
  );
}
process.exit(failed.length ? 1 : 0);

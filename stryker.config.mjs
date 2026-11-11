// Mutation testing (Stryker). Plants small bugs in the code below — a flipped
// comparison, a deleted condition, a changed string — and reruns the unit tests
// against each one. A mutant the tests still pass on ("survived") is a bug they
// would not catch.
//
// Scoped on purpose to the code where an uncaught bug costs money, data or
// security, not the whole repository. Add a module to MODULES when it joins
// that list, with a floor just under its first score.
//
//   npm run test:mutation                                   # every module
//   STRYKER_MUTATE=lib/order.ts npm run test:mutation       # just these (comma-separated)
//
// npm run test:mutation is scripts/mutation-run.mjs, which runs Stryker once
// per module so each mutant meets only the tests related to its own module,
// and merges the reports. `npx stryker run` alone works too, but every mutant
// then runs the tests of every module named.
//
// .github/workflows/mutation.yml runs it on every pull request, for the modules
// the PR touches (scripts/mutation-scope.mjs), and on all of them weekly.
// scripts/mutation-check.mjs then fails the job if a module's score is below
// its floor. Raise a floor when a module's tests improve; never lower one to
// make a pull request pass.

/** Each mutated module: why it is here, and the lowest score it may have (%). */
export const MODULES = {
  "lib/order.ts": { why: "what an order is: server-side titles and prices", floor: 97 },
  "lib/availability.ts": { why: "sold-out rules", floor: 93 },
  "lib/form-input.ts": { why: "limits on what the public forms accept", floor: 93 },
  "lib/rate-limit.ts": { why: "admin login lockout", floor: 82 },
  "lib/db-guard.ts": { why: "keeps laptops and previews off production", floor: 76 },
  "lib/private-blob.ts": { why: "which private files /media may reach", floor: 89 },
  "app/media/[...path]/route.ts": { why: "who may see an unpublished upload", floor: 91 },
  "lib/backup.ts": { why: "snapshot, fingerprint, restore", floor: 98 },
  "lib/instagram-publish.ts": { why: "never post twice", floor: 96 },
  "lib/product-path.ts": { why: "a work's URL and slug rules", floor: 97 },
  "lib/legacy-urls.ts": { why: "old Squarespace links: redirect, 404 or 410", floor: 71 },
  "lib/passkey.ts": { why: "admin sign-in: which site, when the password may be used", floor: 91 },
  "lib/session.ts": { why: "the admin session cookie", floor: 98 },
  "app/actions/passkey.ts": { why: "admin passkey sign-in and registration", floor: 92 },
};

const all = Object.keys(MODULES);
const only = (process.env.STRYKER_MUTATE ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const unknown = only.filter((m) => !MODULES[m]);
if (unknown.length) throw new Error(`STRYKER_MUTATE names modules not in MODULES: ${unknown.join(", ")}`);
const modules = only.length ? only : all;

// Stryker's `mutate` is a glob, where "[...path]" would be a character class and
// escaping it matches nothing; a bracketed segment becomes "*".
const glob = (file) => file.replace(/\[[^/\]]*\]/g, "*");
const quote = (file) => `'${file}'`;
/** "app/media/[...path]/route.ts" → "app-media-path-route-ts", for report names. */
export const slug = (file) => file.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
const report = modules.length === 1 ? `reports/mutation/${slug(modules[0])}` : "reports/mutation/all";

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  // The command runner, not @stryker-mutator/vitest-runner: under Vitest 5 that
  // runner never switches a mutant on inside the test worker (it sets it from a
  // beforeAll hook in its setup file), so every runtime mutant "survived" and
  // the scores were near zero. Forced on through __STRYKER_ACTIVE_MUTANT__, the
  // same mutants fail the tests. The command runner activates each mutant that
  // way, in a fresh Vitest run. Slower per mutant; revisit the vitest runner
  // when it supports Vitest 5.
  //
  // `vitest related` runs every test that imports a mutated module, directly or
  // through the routes and actions that use it, so no list of test files has to
  // be kept in step with the tests. One Vitest worker per run: Stryker already
  // runs one per core, and a pool in each starved them into false timeouts,
  // which Stryker counts as kills.
  testRunner: "command",
  commandRunner: {
    command: `npx vitest related --run --bail=1 --maxWorkers=1 --reporter=dot ${modules.map(quote).join(" ")}`,
  },
  coverageAnalysis: "off",
  mutate: modules.map(glob),
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: `${report}.html` },
  jsonReporter: { fileName: `${report}.json` },
  // No incremental mode: with the command runner Stryker sees one test with no
  // file, so it cannot tell when a test changed, and would keep reporting a
  // mutant "killed" by a test that has since been weakened or deleted.
  tempDirName: ".stryker-tmp",
  timeoutMS: 20000,
  // Pass or fail is per module, against MODULES' floors (scripts/mutation-check.mjs).
  thresholds: { high: 80, low: 60, break: null },
};

export default config;

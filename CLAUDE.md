# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important: Next.js Version

This project uses **Next.js 16** with React 19. APIs and conventions differ from older Next.js versions. Read `node_modules/next/dist/docs/` before making architectural changes. The `params` prop in dynamic routes is a **Promise** and must be awaited (server components) or unwrapped with `use()` (client components).

## Commands

```bash
/opt/homebrew/bin/npm run dev        # Start dev server on port 3000
/opt/homebrew/bin/npm run build      # Run tests + production build + TypeScript check
/opt/homebrew/bin/npm run test       # Vitest unit tests only
/opt/homebrew/bin/npm run test:e2e   # Playwright end-to-end tests (requires dev server)
/opt/homebrew/bin/npm run lint       # ESLint
/opt/homebrew/bin/npm run tests:inventory   # Rewrite data/test-inventory.json (commit it)

/opt/homebrew/bin/npm run instagram:generate   # Draft Instagram captions into the queue
```

The build script runs `prisma generate && NODE_ENV=test vitest run && tsx scripts/assert-build-database.ts && prisma db push && next build`. Tests must pass before the schema is pushed to the database or Next.js compiles. This runs on every Vercel deploy — a failing test blocks deployment.

Between the unit tests and `next build`, the build also runs `scripts/test-inventory.mjs`, which writes `data/test-inventory.json` (every unit and E2E test by name, from Vitest's JSON report and `playwright test --list`) for `/architecture/tests` and the counts on `/architecture`. **Commit it when tests change** — `npm run tests:inventory` regenerates it without a full build; CI fails if the committed copy differs from what its build wrote. The file is deterministic (sorted, no timings), so it only changes when a test does.

## Git Workflow

Always work on a feature branch — never commit directly to `main`.

```bash
git checkout -b feature/short-description   # create branch
# ... make changes, commit ...
git push -u origin feature/short-description
gh pr create                                 # open PR into main
```

Vercel auto-deploys `main`. Merging a PR triggers a production deployment.

### Before opening a PR: check `/for-artists` and `/architecture`

Two pages make **factual claims about how this site is built**:
`app/for-artists/page.tsx` has the feature list ("What you get"), and
`app/architecture/page.tsx` is a numbered technical deep-dive written for lead
engineers — an executive summary, operations, request path, CI/CD, data model, key flows, media pipeline, build
guards, security, security testing, build notes, durability, decisions and a
repository map. Unlike
the rest of the site they go stale whenever the build changes, and they do so
silently: nothing fails, the page just starts lying.

So when a change touches any of the following, re-read the page named and
update it in the same PR:

| If you changed… | Check |
|---|---|
| A user-facing feature | `/for-artists`: the "What you get" bullets — is the new feature listed? |
| A route handler, server action, external service, or how pages render | `/architecture` §3 request path (diagram included) and §6 key flows |
| CI, the build script, `vercel.json`, or the test setup | `/architecture` §2 operations, §4 CI/CD, §8 guards |
| The Prisma schema | `/architecture` §5 data model |
| Where images, films or uploads live | `/architecture` §7 media pipeline and the §3 diagram |
| Auth, sessions, rate limits, validation, or anything stored about visitors | `/architecture` §9 security & privacy |
| Security tooling: scanners, Dependabot, pen or load tests, headers, firewall rules | `/architecture` §10 security testing & resilience — its "Not done yet" table must shrink as things land |
| Anything in `scripts/`, the cron jobs, or backups | `/architecture` §2 operations and §12 durability, and `RUNBOOK.md` |
| A new top-level directory or important module | `/architecture` §14 repository map |

Two real examples of the drift this prevents: the page claimed the catalogue
lived in Vercel Blob for a day after every image had been moved into the repo,
and the Locations map went unlisted despite being the most distinctive feature
on the site.

## Deployment

Push to `main` on GitHub (`https://github.com/JamesPortman/georgian-bay-artists`) → Vercel auto-deploys to `https://www.georgianartist.com`. No manual deploy step needed.

**Every production deploy is smoke-tested.** `.github/workflows/smoke.yml` runs
on Vercel's `deployment_status` event: a failed deploy fails the run; a
successful one runs `scripts/smoke.mjs`, which polls `/api/version` until the
deployed commit (`VERCEL_GIT_COMMIT_SHA`) is live on the domain — a newer deploy
having superseded it also passes — then checks key pages render with their CSP
nonce and headers, plus the sitemap and robots.txt. Any failure opens a GitHub
issue (the run is started by Vercel's bot, so nobody gets GitHub's failure
email). Run it by hand with `node scripts/smoke.mjs <url> [commit]`, or the
workflow's manual trigger. After merging, still confirm the run passed.

**Preview deployments are opt-in and can't touch production** (Oct 2026). `vercel.json`'s `ignoreCommand` builds production always and any other branch only when `ENABLE_PREVIEWS=1` is set in Vercel (Dependabot branches never). Every preview is behind Vercel Authentication (on for all deployments except the custom domains). The danger is the database: the Neon integration's `DATABASE_URL` is shared by Production **and** Preview, so a preview would `prisma db push` to, and the admin would write to, production. So `lib/db-guard.ts` refuses a database on a preview unless `PRODUCTION_DATABASE_HOST` is set and `DATABASE_URL` is a **different Neon endpoint**, and `scripts/assert-build-database.ts` runs that check before `prisma db push` in every build (which also stops a laptop build pushing to an unnamed remote database). Publishing to Instagram is refused on any Vercel environment but production. To turn previews on: enable the Neon integration's **preview branching** (each preview gets its own branch), set `PRODUCTION_DATABASE_HOST` (all environments) to production's Neon host, then `ENABLE_PREVIEWS=1` (Preview). The pre-merge gate is still GitHub Actions — `.github/workflows/e2e.yml` runs `npm run build` (unit tests included) and the Playwright suite against a throwaway Postgres on every pull request and push to `main`.

**Dependencies.** `.github/dependabot.yml` opens grouped update PRs (npm weekly, GitHub Actions monthly); Dependabot security alerts and automatic security-fix PRs are on in the repo settings. CI's first step is `npx audit-ci --config audit-ci.jsonc`: production dependencies, failing on any *high* or critical advisory. The one named exception is the Prisma CLI's build-time dependencies (deepmerge-ts via `@prisma/config`, mysql2), allowlisted in `audit-ci.jsonc` by advisory **and path** so the same advisory arriving any other way still fails; no 7.x release fixes them, and `npm audit fix` "resolves" them by downgrading to Prisma 6, so never accept that suggestion. Remove an entry when a Prisma release drops it (audit-ci prints entries that no longer match). Never widen the allowlist to make a new finding pass. Prisma's CLI and client must stay on the same version; Dependabot ignores Prisma majors for that reason. Dependabot waits a **7-day cooldown** before offering a release (security updates skip it), and every workflow action is **pinned to a commit SHA** with its version as a comment — keep new `uses:` lines that way; Semgrep fails the build on a bare tag. **CI lints** (`npm run lint`, after the audit) — it didn't until TypeScript 7 and ESLint 10 arrived as Dependabot PRs that passed every check while breaking lint outright. Both are held in `dependabot.yml` until typescript-eslint / `eslint-config-next` support them; `@types/node` follows the runtime (Node 24 — `engines`, `.nvmrc`, CI), so its majors are ignored until the runtime moves. Vitest is on 5 (accepts `@types/node` ^22 or >=24). **Dev-only alerts (October 2026):** `package.json` `overrides` lifts `qs` under Stryker's `typed-rest-client` (which pins 6.15.1) to ^6.16.0 for three moderate advisories; drop the override once `typed-rest-client` ships a newer `qs`. The high `braces` advisory (via `eslint-config-next` → `fast-glob` → `micromatch`) has no fixed release yet; it is lint tooling only, never shipped, and `npm audit fix --force` would "fix" it by downgrading `eslint-config-next` to 14, so never accept that either. The remaining high alerts are the Prisma CLI chain above.

**Actions minutes are finite.** Both CI workflows cancel a PR's run when a newer push supersedes it (`concurrency`, never on `main`), `e2e.yml` skips Markdown-only changes, and ZAP runs on `main` only. On 28 Sep 2026 a day of parallel sessions used up the free minutes, and every job failed to start until a spending limit (US$20/month) was set. A red run with **zero steps** is a billing block, not a test failure: read the job's annotations before debugging, and verify deploys by hand with `scripts/smoke.mjs` while it lasts.

**Static analysis** — `.github/workflows/static-analysis.yml`, in parallel with E2E on every PR: Gitleaks scans the whole git history for credentials (redacted output; pinned version, checksum-verified), Semgrep scans the source with the TypeScript, React, Next.js, OWASP Top 10 and secrets rulesets. Any finding fails. Run them locally with `brew install gitleaks semgrep`, then `gitleaks git --redact .` and `semgrep scan --metrics=off --error --config p/typescript --config p/react --config p/nextjs --config p/owasp-top-ten --config p/secrets`. Semgrep's rules come from its registry at run time, so a new rule can surface a new finding on an unrelated PR — fix it, or exclude the path in `.semgrepignore` with the reason. A Gitleaks false positive goes in `.gitleaksignore` by fingerprint; a real one means rotating the secret, not just deleting it.

**Node is pinned** to 24 (`engines.node`, `.nvmrc`); CI's `setup-node` and Vercel both honour it, so a bump is one PR that changes all three places. Moved from 22 in October 2026. Vercel's builds and functions offer only 24.x and 22.x, so Node 26 (on Homebrew Macs since autumn 2026) has to wait for Vercel: a Mac on 26 runs code production can't, and one unit test (`session-expiry`) already fails there. Keep the Mac on the pinned major too (`brew install node@24`).

**CI minutes.** A PR run is about twelve Actions minutes on the free plan's 2,000. `e2e.yml` skips Markdown-only changes and caches the Playwright browser download by version. **Never skip with a workflow-level `paths`/`paths-ignore` filter**: a skipped workflow never reports, and a required check that never reports blocks the PR for good. `e2e.yml` and `mutation.yml` run on every PR instead; a small `changes` job reads the diff and the main job is skipped by its `if:` (a skipped job counts as passing), and runs anyway if the diff couldn't be read.

Node.js and npm are at `/opt/homebrew/bin/` (not in the default PATH in some shells).

## Architecture

### Data layer — database (Neon Postgres + Prisma)

**The live site reads products from a Postgres database**, not the TypeScript files. Source of truth is the `Product` table (`prisma/schema.prisma`), covering both paintings (`type: "painting"`) and photographs (`type: "photograph"`).

- **`lib/db.ts`** — calls **`lib/db-guard.ts`** first: off Vercel, it refuses any remote database whose host isn't named in `DATABASE_ALLOW_HOST`, so a local `.env` can't reach production by accident. **`VERCEL=1` alone doesn't prove "on Vercel"**: `vercel env pull` writes it (and `VERCEL_ENV`) into the pulled file. So callers pass where they run: scripts (the default, `"script"`) ignore `VERCEL` entirely; the build's checks (`scripts/assert-build-database.ts`, `scripts/assert-catalogue-on-blob.ts`; `"build"`, and a test makes every guarded script in `npm run build` pass it) trust it only with `CI=1`; `lib/db.ts` (`"app"`) trusts it except under `next dev`. Locally, use a Neon dev branch (name its host in `.env.local`) or a local Postgres; to run a script against production on purpose, name production's host for that one command (`DATABASE_ALLOW_HOST=ep-….neon.tech npm run db:export`). Then it exports the Prisma client over the Neon HTTP adapter (any `neon.tech` URL; a plain Postgres URL, as in CI/E2E, gets the standard `pg` adapter instead). Used for all reads and writes. Single-statement writes (create/update/delete) work over HTTP; batch ops (updateMany/createMany/upsert) need a transaction, so the admin avoids them (reorder loops single updates).
- **A product's `id` is permanent; its URL is `slug`.** Blob filenames, analytics, Instagram posts and films key on `id`, and nothing changes it. `slug` (null = the id is the URL, i.e. never renamed) can be changed in the admin's edit form: the old slug goes into `ProductSlug`, and `/products/<old>` / `/photographs/<old>` 308 to the current page (`lib/product-lookup.ts`, used by both work pages). A slug is never both current and retired; `slugTakenBy()` refuses another work's current or retired slug, and new ids avoid them too. Uniqueness is enforced there, **not by a constraint**: `prisma db push` won't add a unique constraint to a populated table without `--accept-data-loss`, which the build must never pass (this would have failed the production deploy). **Build every link to a work with `productPath()` (`lib/product-path.ts`)**, never from `id`; a link from the id still works after a rename, but only through a redirect.
- **Admin CMS at `/admin`** — add (with image upload), edit (incl. image replacement), delete, drag-to-reorder, and Sale/New/Sold/Visible toggles. Auth is a **passkey** (see [Admin sign-in](#admin-sign-in-passkeys)); `ADMIN_PASSWORD` works only until the first passkey is registered, then only under the break-glass. The session is iron-session (`lib/session.ts`). See `app/actions/admin.ts` and `app/actions/passkey.ts`.
- **Image storage** — admin uploads go to Vercel Blob: to the **private store** (`PRIVATE_BLOB_READ_WRITE_TOKEN`, `lib/private-blob.ts` `uploadMedia()`) when it exists, stored on the row as `/media/<pathname>` and served by `app/media/[...path]/route.ts` only while a **visible** work references the file (image, inspiration, home photo) or to a signed-in admin; otherwise (no token) to the public store as before (`BLOB_READ_WRITE_TOKEN`). The route serves only plain files under `paintings/ photographs/ inspiration/ homes/` (`mediaPathname`), so the backups in the same store are unreachable through it. Admin `<Image>`s of `/media` files are `unoptimized`, because the optimiser fetches without the admin's cookie. `releaseBlob()` and the pruner handle both stores. Images are downscaled to 2400px JPEG and HEIC-converted **in the browser** before upload (`app/admin/products/imageProcessing.ts`). **Blob is the catalogue's one home (Oct 2026).** The original works were committed under `public/paintings`, `public/photographs` and `public/mockups`; a one-off script copied them to the public store at `catalogue/<same path>` and repointed every row (Product image, inspiration, the new `mockupImage`; Instagram posts), and the folders left the repo. Seed data names the same copies (`siteConfig.blobStore` + `/catalogue/…`). **`scripts/assert-catalogue-on-blob.ts` runs in the build after `prisma db push`** and stops the deploy if any row still names an old `/paintings/`, `/photographs/` or `/mockups/` path, relative or on the site's origin, because nothing serves them now. A painting's room view is its `mockupImage`, or the CSS composite when it has none (`mockupFor()`); never guess `/mockups/<id>.jpg`. `catalogue/` files are never deleted automatically: the pruner skips them and `releaseBlob()` keeps them. Replacing a painting's image clears its `mockupImage` (the CSS room view takes over).
- **Making-of films** — the `MakingOf` table (`lib/making-of.ts`). The videos and posters are too large to commit, so they stay on Blob; `scripts/publish-films.ts` uploads them and creates the rows. `data/making-of.ts` is seed data only.
- **Collectors' home photos** — `homePhoto` / `homePhotoCredit` on `Product`, paintings only, uploaded through the admin to Blob under `homes/`. On the work's page it **replaces** the generated "In a Room" mockup and is labelled "In a collector's home", with "Photo courtesy of …" beneath — never labelled like the mockup, because a real photo and a staged one must not read as the same claim. These photographs are the collectors', not the artist's, so they carry **no metadata** (a phone photo taken in someone's kitchen carries their home's GPS) and **no** artist copyright. `prepareHomePhoto()` in `lib/home-photo.ts` does it by **re-encoding** with sharp, and it **fails closed** — an unreadable file refuses the upload rather than publishing as-is. Do not swap in `stripMetadata()`: it edits JPEG segments and returns anything else untouched, and that is how the first version published a PNG with its GPS intact. The credit follows the photo into the lightbox, too. Counted as a reference by `lib/blob-cleanup.ts` and the pruner, and removable from the edit form, since someone may ask for their photo back.
- **Pages are `force-dynamic`, catalogue reads are cached.** Every page renders per request (the root layout reads `headers()` for the CSP nonce; prerendering was rejected because a static page can't carry one). Public pages read through **`catalogue` from `lib/catalogue-cache.ts`**, a cached twin of `prisma` (`unstable_cache`, tag `catalogue`, 1-hour fallback; Dates revived), so Neon (Free plan: suspends after 5 idle minutes) isn't woken by visitors. **Every admin write must call `updateTag(CATALOGUE_TAG)`** (`revalidateProductPaths()` does; the reorder action does). Edits from `scripts/` or the Neon console show within the hour, or at once after **Refresh site** in the admin (`refreshCatalogueAction`). **Each deployment starts with an empty cache**: `cacheKey()` puts `VERCEL_DEPLOYMENT_ID` (or the commit) in every key, because Next's data cache outlives a deploy and once served a new build the previous one's image paths. Never read through `catalogue` where the answer decides a write or must be current: the admin, crons, the Instagram publisher, `slugTakenBy()`, `/media`'s visibility check and `/api/health` use `prisma`. A new public read: use `catalogue`, and if it's a new model, add it there.
- **Reordering is one statement** (`reorderProductsAction`: `UPDATE … FROM (VALUES …)`), applied whole or not at all. It was a loop of single updates; a failure halfway left an order nobody chose. Write anything that must be atomic as a single raw statement — the Neon HTTP adapter has no transactions.
- **Schema changes** apply on deploy: the build runs `prisma db push` (additive/nullable changes only — no migrations dir). Keep `schema.prisma` the source of truth.
- **Backups** — a Vercel Cron **every six hours** (`app/api/cron/backup`, `vercel.json`) writes a snapshot (`lib/backup.ts`: `Product`, `MakingOf`, `InstagramPost`, `ExcludedVisitor`, `ProductSlug`; `version: 2`) to the **private** Blob store at `backups/catalog-<date>T<hh-mm>.json`, keeps seven days in both stores, and emails the owner if the write fails. Six hours because **Neon's Free plan keeps six hours of point-in-time history** (1 GB cap); past that a snapshot is the only way back. Without `PRIVATE_BLOB_READ_WRITE_TOKEN` it falls back to the public store with a random suffix, as before. (A public store can't hold `access: "private"` objects — that throws — hence the second store.) **Restore drill:** `npm run backup:drill` (`scripts/backup-drill.ts`) restores the newest private snapshot (or `-- --file <path>`, or `-- --from-db`) into an empty `DRILL_DATABASE_URL` (guarded like everything else; a Neon branch named in `DATABASE_ALLOW_HOST`, or local) and fails unless every table's fingerprint matches. CI runs it `--from-db` on every PR. `npm run db:export` writes the same format locally to `backups/` (gitignored).
- **Secrets** — every credential lives in Vercel's Production env vars. `npm run secrets:backup` (`scripts/secrets-backup.sh`; needs the Vercel CLI linked and `age`) pulls them and writes a passphrase-encrypted `georgianartist-secrets-<date>.env.age` **outside the repo** (default `~/Documents/georgianartist-secrets/`; `*.env.age` is gitignored too); `-- --verify <file>` lists the names inside. Rerun it after rotating anything. `RUNBOOK.md` is the one-page handover (accounts, secrets, incidents): update it when a provider, secret or cron changes.
- **Unused blobs** — `npm run blobs:prune -- all` lists every blob nothing points at (`-- all --apply` archives each to `.blob-archive/` and deletes it). A blob is in use if a `Product`, `MakingOf` or `InstagramPost` row, or any tracked text file in the repo, holds its **full URL**, or the seed data builds it (`data/making-of.ts` assembles its URLs from a template, which a text scan can't see; the pruner imports the seeds for that reason); never match on the path alone, since the catalogue's own images in `public/` share names with old uploads. The areas and rules are in `lib/blob-prune.ts` (tested). It covers every folder the admin writes to, with a 24-hour grace period for fresh uploads, never touches `backups/`, `press/` (hand-uploaded press material whose URL may be shared off-site) or `catalogue/` (the catalogue's own images; `NEVER_PRUNED`), and prints any top-level folder no area covers. Until 29 Sep 2026 it skipped `paintings/`, `photographs/` and `homes/`, and nine orphans built up unseen, so when a new upload folder appears, add an area for it.
- **Other crons** — `vercel.json` also schedules Instagram posting (see [Instagram auto-posting](#instagram-auto-posting)) and a daily analytics prune (`app/api/cron/prune-analytics`, 05:30 UTC) that deletes `AnalyticsEvent` rows older than 25 months to keep the table lean, and `FormRateLimit` counters older than a day. A **health check** (`app/api/cron/health`, hourly; logic in `lib/health.ts`) confirms the database answers and four real pages render on the live domain (`HEALTH_CHECK_BASE_URL` overrides it), and emails through `lib/notify.ts` only when the state changes — once on failure, once (✅) on recovery — using the one-row `HealthState` table, read and written in a single CTE statement. If the database itself is down it can't read the state, so it emails anyway rather than risk silence. It can't see a Vercel-wide or domain outage — **Better Stack** (free plan, the owner's account) watches from outside every three minutes: one monitor on the home page, one on **`/api/health`** (`app/api/health/route.ts`), which returns 200 `{"ok":true}` only when the database answers and 503 otherwise. That second monitor exists because the free plan can only check that a URL responds (keyword checks, SSL-expiry and domain-expiry alerts are paid), and during a database outage the site still responds with its error page. `/api/health` must stay content-free and cheap: a healthy answer is edge-cached for 30 minutes, a failure never is. **Neither may touch the database more often than that.** Neon's Free plan suspends the database after 5 idle minutes and bills the minutes it's awake; with the cron every 10 minutes and the 3-minute Better Stack check reaching the database through a 30 s cache, it never slept, and the month's 100 CU-hours were gone by 16 Oct 2026 (0.25 CU × 400 h). Anything new that queries on a schedule shorter than about half an hour has the same effect. The post-deploy smoke test checks it too. It's a single `deleteMany` on purpose — batch ops need a transaction, but one statement is safe over the Neon HTTP adapter. All cron routes are guarded by `CRON_SECRET`.

**`data/products.ts` / `data/photographs.ts`** — now **seed data only** (feed `npm run db:seed` for a fresh DB; do not expect edits here to change the live site). Still live and shared: the `SizeType` union, the `sizeOptions` price table, and the `Product` / `Photograph` types.

**`data/blurs.ts`** — base64 blur placeholders for the **seeded** images only, keyed by image file name; static since the catalogue moved to Blob (its generator went with the committed files). Uploaded products carry their own `blurDataURL` (generated in-browser at upload, stored in the DB). Components prefer `product.blurDataURL ?? blurDataURLs[id]`.

Every entry ships in the bundle wherever a `ProductCard` renders, so they stay
metadata-free: `sips` copies the source's EXIF/XMP into the thumbnail it makes,
which once took each placeholder from ~860 bytes to ~4400 and the whole file
from 46KB to 200KB — silently. The script strips it, which also makes the
output depend only on pixels, so changing one image stops rewriting all 44
entries. `__tests__/data.test.ts` fails the build if metadata reappears.
Filename stems are the keys and are **not** unique across the two folders —
legitimately, since a painting and the photograph it was painted from share a
name (`northwinds-beach` is both, and the photograph is that painting's
`inspirationImage`, so it is in use, not litter). The script keeps the first
and reports the clash rather than silently overwriting. Resolve a collision by
renaming, never by deleting: check **both** `image` and `inspirationImage`
before calling any catalogue file unreferenced.

**Pure product logic** lives in **`lib/product-utils.ts`** (`deriveSizeType`, `standardPrice`, `slugify`) — unit-tested in `__tests__/product-utils.test.ts`.

### Page structure

**Gallery order.** "Featured", the default view of both galleries, is `sortOrder` as the page loads it — sold-out work last (`soldOutLast`), nothing else reordered. It used to regroup by New/Sale/price on the paintings (so the admin's drag order only broke ties) and default to price on the photographs. `sortOrder` is set by drag-to-reorder in the admin and by `npm run catalogue:rank-by-engagement` (dry run; `-- --commit` to write), which ranks each type by distinct-visitor engagement over all analytics (`lib/engagement-rank.ts`: view 1, gallery click 1, Buy Now open 3, order 10; works with fewer than 3 viewers keep their order; archives the old order to `.blob-archive/sort-order` first). First applied 28 Sep 2026. Engagement is biased toward whatever is already near the top, so rerun it occasionally rather than on a schedule.

Pages that need interactivity (category filter, size selector) are split into a **server page file** + a **`*Client.tsx` file**:

```
app/page.tsx                    ← server component, exports metadata
app/HomeClient.tsx              ← "use client", handles category filter state

app/photographs/page.tsx        ← server component, exports metadata
app/photographs/PhotographsClient.tsx

app/products/[id]/page.tsx      ← server component, exports generateMetadata + JSON-LD
app/products/[id]/ProductDetailClient.tsx   ← "use client", size selector + Buy Now

app/photographs/[id]/page.tsx   ← server component, exports generateMetadata + JSON-LD
app/photographs/[id]/PhotographDetailClient.tsx
```

Of the static pages (`about`, `contact`), only `contact` needs the split — `ContactClient.tsx` holds the form state. `/contact` is **FAQ & Contact** ("FAQ/Contact" in the menu): `components/Faq.tsx` above the form; `/faq` 308-redirects to `/contact#faq`.

### Components (`components/`)

- **`ProductCard`** — reused for both paintings and photographs; accepts optional `basePath` prop (defaults to `/products`, pass `/photographs` for photo cards); uses `product.blurDataURL ?? blurDataURLs[id]` — uploaded products carry their own placeholder, seeded ones fall back to `data/blurs.ts`
- **`BuyNowButton`** — `"use client"` component; opens an order form (name, email, phone, shipping address) and posts an `order` of **ids and choices only** (`lib/order.ts`: a print, a single card, or a gift pack) to `app/api/buy`, which looks up the title and price server-side and emails the owner via Resend; shows a confirmation message on success. Its `title`/`sizeLabel`/`price` props are display-only — see [Public forms](#public-forms)
- **`SaleBanner`** — thin brand-colour strip above the navigation announcing the current sale; the copy and on/off switch are `saleBanner` in `data/siteConfig.ts`, prefixed with the current season (`lib/season.ts`)
- **`Navigation`** — sticky header with desktop nav + mobile hamburger. The seven storefront links (Contact last), then **For Artists** set apart as an outlined button (`data-audience="artists"`) — a different reader, so a separate door rather than an eighth link. Architecture is the one `FOOTER_LINKS` entry in `components/Footer.tsx`

### SEO & discoverability

- **Sitemap** — `app/sitemap.ts` auto-generates `/sitemap.xml` covering all product, photograph, and static pages
- **Open Graph** — `generateMetadata` in each `[id]/page.tsx` sets `openGraph.images` to the product image; `metadataBase` in `layout.tsx` resolves relative URLs
- **JSON-LD** — `Product` schema with `AggregateOffer` (CAD price range) is injected by each `[id]/page.tsx` server component
- **robots.txt** — generated by `app/robots.ts` from `siteConfig.url`, so the sitemap URL follows the domain (it was a static file in `public/`, which the identity test cannot see)

### Styling

Tailwind CSS v4. All prices shown in CA$.

**Do not write the brand green as a hex.** It is a `@theme` token in
`app/globals.css` (`--color-brand`, `--color-brand-hover`, `--color-brand-tint`),
so the classes are `bg-brand`, `text-brand`, `border-brand/30`,
`hover:bg-brand-hover`. `__tests__/brand-colour.test.ts` fails the build on any
brand hex literal under `app/`, `components/` or `lib/` — it was 186 of them,
which is how the site ended up with four different hover greens for the same
button. See [Site identity](#site-identity) for the full picture, including
`lib/brand.ts` for the few places that need the value as a JS string.

### Adding a new painting or photograph

Through the admin: **/admin → Add product**. The browser downscales to 2400px JPEG (HEIC converted) and makes the blur placeholder; the server stamps the copyright notice and stores the file on Blob (the private store when it exists, `lib/private-blob.ts`), and the work's room view is the CSS composite. Nothing is committed. Source images from the old Squarespace site are WebP files despite their `.jpg` extensions; the browser handles them, but if you prepare one by hand, convert explicitly (`sips -Z 2400 -s format jpeg in.jpg --out out.jpg`). `data/products.ts` and `data/photographs.ts` are seed data for a fresh database only.

### Site identity

**`data/siteConfig.ts` is the only file that knows whose site this is** —
brand, artist, tagline, canonical URL, contact addresses, phone, Instagram
handle, GA4 id. These were literals typed into whichever page needed them
(the brand name 46 times, the domain 36), which made the identity a hundred
decisions instead of one, and they could disagree silently.

`__tests__/site-config.test.ts` fails the build if any of those values is
hard-coded in `app/`, `components/` or `lib/` again. Comments are exempt —
a comment naming the live domain is useful.

Two names, deliberately not one: `brand` is the storefront (nav, page titles,
JSON-LD, email from-name), `artist` is the person who made the work (the
copyright holder). Collapsing them is what put a brand name in the rights
field of every image in the repo.

The brand colour works the same way: `@theme` in `app/globals.css` defines
`--color-brand`, `--color-brand-hover` and `--color-brand-tint`, and the
classes are `bg-brand`, `text-brand`, `border-brand/30`. `lib/brand.ts` mirrors
the values for SVG and map code that cannot use a class, pinned by a test. It
was 186 hex literals, which is how the site acquired four different hover
greens for the same button.

`testimonial` and `press` in the same file are the two places the site quotes
somebody else — a collector under the gallery, and the Blank Spaces feature.
Both are nullable, and **null removes the section entirely** rather than
leaving an empty heading, because a fork starts with no collectors and no
coverage. `components/Testimonial.tsx` and `components/PressStrip.tsx` own that
check; `__tests__/site-content.test.tsx` covers the empty case, which is the
one that matters.

The exception is `app/about/page.tsx`, which names the publication in the bio
prose. That page is bespoke copy a fork rewrites wholesale rather than
parameterises, so the identity scan deliberately does not police it.

Out of scope on purpose: `/for-artists`, `/architecture` and `/book` are
James's own pitch for building these sites, not part of an artist's storefront.
A fork deletes them rather than rebranding them.

### Image copyright metadata

**The claim itself lives in `lib/copyright.ts`** — holder, credit, start year,
notice. Three things assert it (the footer, the repo's image files, admin
uploads) and they have drifted apart once already, with the footer naming one
holder and every image file naming another. Change it there, nowhere else.

The names themselves now come from `data/siteConfig.ts` — `artist` and `brand`
— and `lib/copyright.ts` reads them, so whose site this is stays one decision.
The copyright-specific judgements (holder vs credit, start year, the wording of
the notice) still live in `lib/copyright.ts`. Note that the footer only started
reading from it in September 2026; before that the doc above said it did and
the markup had the name typed in.

Note that **rights holder and credit line are different claims**: the copyright
notice names who owns the work (`James Portman`), the credit line names the
brand you'd print beneath it (`Georgian Bay Artists`). Conflating them is what
produced the drift.

Two paths write it, because the two kinds of image live in different places:

| Images | Written by | How |
|---|---|---|
| Files on disk, before uploading (e.g. a studio export) | `npm run images:copyright -- <path> …` | shells out to exiftool — EXIF + IPTC + XMP |
| Uploaded through the admin (Vercel Blob) | `lib/image-copyright.ts`, on every upload of the artist's own work in `app/actions/admin.ts` — **not** collectors' home photos, which are stripped instead (see Collectors' home photos) | pure JS — EXIF + XMP |

The upload path can't use the script: it runs in a serverless function with no
exiftool and no filesystem. So `embedCopyright()` writes the APP1 segments by
hand. It skips IPTC (an APP13 Photoshop resource block, much more work to
synthesise; XMP carries the same fields for every reader that matters), it's
idempotent, and **it returns the buffer untouched on anything it can't parse** —
a missing notice is a small problem, a failed upload of a painting is not.

`npm run images:copyright -- --dry-run` previews; requires `brew install
exiftool`. `npm run images:backfill-blob` tags Blob images uploaded before this
existed — it overwrites the same pathname so URLs and DB rows are untouched,
and is a dry run unless passed `--commit`.

Both paths rewrite metadata only — pixel data is never touched, which is worth
verifying after any change to either (strip all metadata from both versions and
compare hashes).

The metadata survives on the **original** file (`/paintings/x.jpg`, or the Blob
URL) and on any copy you hand out, but Next strips it from the optimized
`/_next/image` variants the browser renders. Most social platforms strip it
too. It's provenance, not protection.

### Security review

`docs/security-review-2026-10.md`: the October 2026 attacker-style review,
its fixes, what was accepted and why, and what needs the owner. Rules it
left behind: cron routes check `isCronRequest()` (`lib/cron-auth.ts`, fails
closed); a state change that must happen once (the Instagram claim) is a
conditional `updateMany` on the current status, never an update by id after
a read; HTML built as a string goes through `escapeHtml`; an email subject
with outside text goes through `subjectLine`; uploads are stored only as
raster image types. New limits on what the public can trigger count
against a daily total as well as per IP.

The private Blob store (`georgian-bay-artists-private`, created October 2026)
must be connected to the project with the env prefix `PRIVATE_BLOB`, never the
default `BLOB`, which is the public store's. `scripts/move-to-private-store.ts`
moved what the public store held before it existed (backups, home photos,
unpublished works' uploads); it lists by default and moves with `--apply`,
archiving each public file to `.blob-archive/` before deleting it.

### TypeScript

`strict` plus **`noUncheckedIndexedAccess`**: `arr[i]`, `record[key]` and
`str.split(x)[n]` are typed as possibly `undefined`, because they can be. In
site code, say what happens when the value is missing (`?? fallback`, an early
`return`, a guard that throws a clear error) rather than asserting it away with
`!`. A list that can never be empty is typed as one (`sizeOptions` is
`Record<SizeType, [SizeOption, ...SizeOption[]]>`, so `sizes[0]` is a size).
In tests, `!` is fine on something the test itself just built or asserted.
Turning the flag on (October 2026) found: `scripts/backup-drill.ts --file`
with no path crashed inside `readFileSync`; `deriveSizeType` with an empty
list of offered sizes returned `undefined`; `pickHashtagSet` for a category
with an empty list of sets returned `undefined`.

### Tests

- **Unit tests** (`__tests__/`) — Vitest + @testing-library/react; `npm run test`
- **E2E tests** (`e2e/`) — Playwright (Chromium only); `npm run test:e2e` (requires `npm run dev` running)

  **The E2E suite writes, so it refuses to run against a non-local database.**
  It creates and deletes a product (uploading a real image to Blob), flips
  Visible/New/Sold on real rows, and rewrites inspiration coordinates —
  including clearing one photo's GPS deliberately. `.env.local` pointed at
  production, so running it as-is used to edit the live catalogue; it did,
  once, moving three products' coordinates and blanking a photo's real GPS.
  `e2e/db-guard.ts` now stops that in `globalSetup`, before any spec runs.
  It is stricter than `lib/db-guard.ts` on purpose: even a host named in
  `DATABASE_ALLOW_HOST` (a dev branch) is refused here without
  `E2E_ALLOW_DESTRUCTIVE_DB=1`.

  To run it locally, give it a throwaway Postgres — the same shape CI uses:

  ```bash
  docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=test --name gba-e2e postgres:16
  export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/test
  npm run db:push && npm run db:seed
  npm run dev            # same DATABASE_URL, separate shell
  npm run test:e2e
  ```

  The dev server needs that `DATABASE_URL` too — it is what the specs browse.
  Running against production also produces *false failures*, because specs are
  written for the seed, not the live catalogue: the film-link count, for one, is
  taken from the seed, and the live site's visible and sold-out works differ.
  `E2E_ALLOW_DESTRUCTIVE_DB=1` overrides the guard; it is not a good idea.

  **Specs import `test` and `expect` from `e2e/test.ts`**, never from
  `@playwright/test` (`__tests__/e2e-imports.test.ts` fails the build
  otherwise). Its auto fixture routes every `/_next/image` request through
  `route.fetch()`, so the request to the server finishes even when the page
  that asked for it has moved on, and teardown waits for all of them before the
  context closes.

  **Optimized images: why that fixture exists.** `next start`'s image
  optimizer (CI's server, not production's — Vercel serves `/_next/image`
  itself) hangs permanently on a request whose browser has already
  disconnected. It fetches the source file with an internal request that
  borrows the client's socket. If that socket is already closed, the internal
  request never finishes, and the optimizer's in-flight entry for that image
  never resolves. From then on, every request for that image, from any
  browser, waits on it until the server restarts. Chrome allows six
  connections per host, so six such images and **nothing else the test does
  reaches the server**. On a cold image cache (every CI run) it took only one
  spec logging in and navigating away while the admin's 44 thumbnails were
  still loading.

  It masqueraded as a database stall for weeks: `zz-admin-manage`'s
  visibility toggle sat on "saving…", every later `page.goto` timed out, and
  it failed three CI runs in a row on #209 once a new spec shifted the
  timing. It was not the database. `pg_stat_activity`, sampled through the
  hang, showed **no connections at all**, and the toggle's `UPDATE` never
  reached Postgres, because the POST never left the browser. Two lessons:
  - **When a test hangs, check whether the request reached the server before
    blaming what the server calls.** In the trace, a request pending with no
    response while other requests to the same host are also pending means
    Chrome's connection pool is full.
  - **It only reproduces on a cold `.next/cache/images`.** A local checkout
    that has run the suite once has warm thumbnails and passes. To reproduce,
    `rm -rf .next/cache/images`, then run a production build (`npm run build`,
    then `CI=true` so Playwright runs `npm run start`) with
    `zz-admin-instagram` before `zz-admin-manage`. Without the fixture, that
    pair failed five runs out of five. With it, it passed five out of five.
- **Visual regression** — `e2e/visual.spec.ts` screenshots five pages (gallery, a painting, photographs, gift shop, about) at desktop and phone width and compares them with `e2e/__screenshots__/` (1% of pixels allowed; the seasonal sale banner, marked `data-seasonal`, and the footer's year are masked). It is its own Playwright project, `visual` (`npm run test:visual`), run in CI **before** the main suite (`npm run test:e2e` is `--project=chromium`), because the admin specs edit the catalogue. **References are only ever rendered on CI's runner**, never a laptop (fonts differ): after an intended visual change, run the **Visual baselines** workflow (`.github/workflows/visual-baselines.yml`, workflow_dispatch, input `branch`), which commits them to the branch; its push starts no other workflow, so push again to re-run the checks. CI never writes a missing reference (`updateSnapshots: "none"`), so a new screenshot fails until one is committed.
- **Performance budget** — `.github/workflows/perf.yml` runs Lighthouse CI (`@lhci/cli`, pinned, via `npx`) against a production build of five pages (gallery, a painting, photographs, gift shop, about) as a simulated phone, five runs each, and fails the PR when the median run passes a limit in `lighthouserc.json`: performance score, LCP, CLS, TBT, JavaScript size. The job summary shows each page's numbers against its limit (`scripts/lhci-summary.mjs`); reports are uploaded as the `lighthouse-reports` artifact. Shared CI runners are noisy (the same code has measured the gallery's TBT at 230–832 ms and /photographs' LCP at 2.9–5.2 s), so limits sit a wide margin past the worst measured values and the gallery has its own looser row: **raise one only for a slowdown you mean, with the reason in the commit**; tighten them when pages get faster.
- **Keyboard** — `e2e/keyboard.spec.ts` (Oct 2026 keyboard audit): the first Tab reaches **Skip to content** (`app/layout.tsx`, target `main#main-content` with `tabIndex={-1}` in `StorefrontChrome`); the phone **Menu** button carries `aria-expanded`/`aria-controls="mobile-menu"`, Escape closes it and refocuses it, links carry `aria-current="page"`; the image viewer is **`components/Lightbox.tsx`** (`role="dialog"`, `aria-modal`, named "<title>, enlarged", focus to Close, Tab trapped, Escape closes, focus returns to the opener) used by both detail pages. Never `focus:outline-none` without a `focus-visible:` replacement (the pack builder's tiles and the Enlarge buttons had none). Form results are `role="status"` / `role="alert"`. Gallery grids take a `heading` (sr-only h2) so card h3s don't skip a level. The screen-reader pass a person does is in `RUNBOOK.md`.
- **Accessibility** — `e2e/accessibility.spec.ts` runs axe-core (`@axe-core/playwright`)
  against WCAG 2.1 A/AA on every public page type, plus the open mobile menu and
  Buy Now form. It runs in the ordinary E2E suite, so CI enforces it — every
  WCAG A/AA rule, since `color-contrast` and `link-in-text-block` were fixed on
  28 Sep 2026. So: **no `text-gray-400` for text** on public pages (2.5:1);
  secondary text is `gray-500`, or `gray-600` where it can sit on the cream
  newsletter band or the brand tint. **A link inside a sentence is underlined**
  (`underline underline-offset-2 hover:no-underline`); colour alone isn't
  enough. `NOT_YET_ENFORCED` is empty but kept for the next rule a new axe
  release adds. A new public page belongs in its `PAGES` list.
- **Vercel runs the unit tests with the production environment.** The build
  script's `vitest run` sees production's `CRON_SECRET`, `RESEND_API_KEY` and
  the rest; CI sees only what `e2e.yml` sets. A test that passed in CI because a
  secret was unset once broke the production deploy (#190 → #191), and a failed
  deploy keeps serving the previous build, so nothing looks wrong. Stub the env
  a test depends on (`vi.stubEnv`), and after merging check the deployment's
  status, not just that pages return 200.
- **Load test** — `load/visitors.js` (k6, `brew install k6`):
  `k6 run -e BASE_URL=… load/visitors.js`. Read-only GETs of pages, up to 50
  visitors with think time, aborting at >1% errors or p95 >3s. BASE_URL has no
  default so production is never hit by accident; it is safe against production
  (no writes, no emails, invisible to analytics) but still costs real function
  and Neon usage, so run it deliberately and record results in `/architecture`
  §10. Not part of CI.
- **Property-based tests** — `__tests__/properties.test.ts` (fast-check): each
  property runs against hundreds of generated inputs (empty, long, Unicode,
  hostile) and a failure is shrunk to the smallest one that breaks it. They
  cover the code that turns untrusted input into something the site acts on:
  `slugify`/`slugProblem`/`productPath`, `deriveSizeType`/`standardPrice`,
  `checkFields`/`readFormBody`, `resolveOrder` (every price comes from the
  catalogue, never the request) and `parseClientError`. A failure prints a
  counterexample and a seed; turn the counterexample into an ordinary example
  test beside the fix. Write a property when a function takes outside input
  or has a rule that holds for all inputs ("always a valid slug", "never
  throws"); keep examples for specific cases. Arrow bodies must not return
  `expect(...)`: fast-check counts a returned `false` as a failure. Under
  Stryker (`__STRYKER_ACTIVE_MUTANT__` set) the file pins fast-check's seed, so
  mutation scores repeat; don't count on a property to kill a mutant at an edge
  it reaches only by chance — pin that edge with an example test.
- **Mutation testing** — `npm run test:mutation` (Stryker, `stryker.config.mjs`;
  ~50 min for every module, report in `reports/mutation/index.html`;
  `STRYKER_MUTATE=lib/order.ts npm run test:mutation` for one). Plants one bug
  at a time in the modules where a missed bug costs money, data or security,
  and reruns the tests related to them (`vitest related`); a surviving mutant
  is behaviour no test pins. **It gates pull requests**:
  `.github/workflows/mutation.yml` mutates only the modules a PR changes or
  whose related tests it changes (`scripts/mutation-scope.mjs`), and
  `scripts/mutation-check.mjs` fails the job if any is below its `floor` in
  `MODULES`. A red mutation check means the PR added logic no test pins, or
  weakened a test: open the report artifact, find the survivors, add or tighten
  tests. **Never lower a floor to pass**; raise one when a module's tests
  improve (the summary suggests it at +5). All modules run weekly too, and a
  weekly run below a floor opens (or comments on) a GitHub issue. It uses
  Stryker's **command** runner on purpose (the Vitest runner never activates
  mutants under Vitest 5 and reports a false ~5%), and no incremental cache
  (with that runner Stryker can't see test changes). To guard a new module, add
  it to `MODULES` with a floor just under its first score. Results and what was
  fixed are in `/architecture` §8.
- `vitest.config.mts` excludes `**/node_modules/**`, not only the top-level one: a git worktree checked out inside the repo (the desktop app puts them under `NewSite/`) brings its own `node_modules`, whose packages ship tests vitest would otherwise run — which once made `npm run build` fail locally with zod's and find-my-way's suites.
- `vitest.setup.ts` sets `IS_REACT_ACT_ENVIRONMENT=true` for React 19 compatibility
- All scripts use `NODE_ENV=test` explicitly so Vercel's `NODE_ENV=production` doesn't break the test run

### Instagram auto-posting

The site posts to Instagram (`@georgian_bay_artist`) on its own: Claude drafts a caption for each
work, the artist approves it, and a cron publishes on a schedule. Nothing publishes unapproved.

- **Queue** — the `InstagramPost` table. Rows move `pending` → `approved` → `posted`; `skipped`
  drops one. `posting` is a transient in-flight state set while publishing. **Publishing is
  idempotent by media container:** the container id is stored on the row (`containerId`) before
  `media_publish` is called, and Meta publishes a container at most once. A publish that errors,
  or a row a previous run left in `posting`, is settled by `reconcilePosting()` in
  `lib/instagram-publish.ts` from the container's status: `PUBLISHED` is recorded (media id found
  by caption), `FINISHED` is published now with the same container (cannot duplicate),
  `EXPIRED`/`ERROR` goes back to `approved`. A claim with no container older than 15 minutes
  never reached `media_publish` and is requeued. The cron reconciles stranded rows before
  posting; the admin's Needs Review has "Check with Instagram". Only when Meta can't say (or a row
  predates `containerId` and isn't on the account) does a row wait for the manual buttons. Never
  publish by creating a second container for a row in `posting`: that is the one way to post
  twice.
- **Generating** — `npm run instagram:generate`, or the "Generate posts" button on
  `/admin/instagram`. Picks visible products not already queued, asks Claude for a caption, inserts
  them as `pending`. Server actions in `app/actions/instagram.ts`; caption prompt and Graph API
  calls in `lib/instagram.ts` (model overridable via `ANTHROPIC_MODEL`).
- **Approving** — `/admin/instagram`, behind the same `ADMIN_PASSWORD` session as the rest of the
  admin. Approving assigns the next free Mon/Wed/Fri slot.
- **Posting** — Vercel Cron `app/api/cron/instagram` (`0 15 * * 1,3,5`) publishes the next approved
  post via the Meta Graph API in two steps: create a media container, then publish it. The split
  matters — a failure before publishing is safe to retry, one after is not.
- **Stale captions** — a repaint replaces the file behind an unchanged URL, so a queued caption can
  end up describing a painting that no longer exists with nothing looking broken (this happened to
  `scenic-caves`). Every post records a `mediaFingerprint` — etag|content-length of `imageUrl` when
  the caption was written — and the cron re-reads it before publishing, putting the post back to
  `pending` and emailing if it moved. The bias is deliberate: only a **confident** mismatch blocks.
  An unreadable fingerprint never holds a post. Coverage is better than first assumed: Vercel Blob
  **does** serve `etag` and `content-length` on HEAD for reels, so videos are guarded too. The one
  real gap is rows queued before the column existed — their fingerprint is `null`, which the guard
  reads as "allow"; `npm run instagram:backfill-fingerprints` baselines them.
- **Hidden works** — an approved post outlives its work's visibility: a work can be hidden after its
  post was approved, and the cron used to publish it anyway, advertising a page that 404s (it would
  have happened to `autumn-canopy`, a duplicate listing hidden in September 2026). Before the repaint
  check, `publishQueuedPost` looks the work up and holds the post — back to `pending`, off the
  schedule, an email from the cron, the reason on screen from "Post now" — if it is hidden or gone.
  A post with no `productId` passes. `__tests__/instagram-publish-hidden.test.ts` pins it.
- **Prices in captions** — `priceRangeFor` builds the range from `salePrice` at **both** ends, the
  same figure the detail page, the JSON-LD `AggregateOffer` and the Buy Now button quote. It once
  mixed the sale floor with the regular ceiling, which invents a price nobody can pay, and every
  queued caption carried it. "Fix prices" on `/admin/instagram` rewrites captions failing
  `captionPriceIsStale`; it runs there rather than in a script because `ANTHROPIC_API_KEY` is
  Production-only in Vercel.
- **Aspect ratio** — Instagram only accepts 0.8–1.91. `prepareImageForInstagram` letterboxes
  anything outside that (panoramas) onto a white canvas and uploads the result to Blob; images
  already in range are posted untouched.
- **Failures are not silent** — the cron checks the access token every run and emails
  `james@portman.ca` via Resend (`lib/notify.ts`) if the token is invalid or a post fails.
- **Env** — `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`, `ANTHROPIC_API_KEY`. The Instagram token is
  a Facebook **Page** token: when renewing it, confirm `debug_token` reports `expires_at: 0` before
  saving. A token with a real expiry looks fine and then silently dies days later — this has bitten
  once already.

### Errors

There is no error-tracking vendor. `instrumentation.ts` exports `onRequestError`, which Next calls for every uncaught error in a render, route handler, server action or the proxy; `lib/error-report.ts` upserts one `ErrorReport` row per error digest (one raw statement, which also claims the alert) and emails the owner through `lib/notify.ts` **at the first occurrence, then once a day per kind**, never per request. The first occurrence's stack (capped at 2,000 characters) is kept in `ErrorReport.stack`. It must never throw. **Browser errors too**: `components/ClientErrorReporter.tsx` (in the root layout) posts uncaught errors and rejections from this site's own scripts, and `app/error.tsx` / `app/global-error.tsx` post a component that crashed in the browser (skipped when it has a digest: the server reported it), to `app/api/client-error` (`lib/client-error.ts` validates; bots dropped; 10 per address per 10 minutes) into the same `ErrorReport` rows with kind `browser (…)`. Anyone can post there, so `reportError()`'s `mayAlert` veto caps these emails at 10 a day in total. `app/error.tsx` is the branded "try again" a visitor sees when a page throws; `app/global-error.tsx` is the bare fallback for the root layout itself (it imports `BRAND` from `lib/brand.ts` rather than typing the hex). Repeats are counted in the table; nothing prunes it yet — it stays small unless something is badly wrong, which is the point.

### Security headers

`lib/security-headers.ts` is applied to every route by `next.config.ts`:
`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, a `Permissions-Policy` switching off
camera, microphone, geolocation, payment and friends, and
`Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy: same-origin`
(so other sites can't hotlink the images; crawlers and the Instagram API fetch
server-side and are unaffected). `poweredByHeader: false` drops `X-Powered-By`.
No `Cross-Origin-Embedder-Policy`: `require-corp` would block the map iframe,
the tiles and GA4. DENY is safe because the
site never frames its own pages — the OpenStreetMap iframe is the site framing
someone else. HSTS comes from Vercel; don't add `includeSubDomains` here, it is
a domain-wide decision.

**Content-Security-Policy** is separate, because it needs a fresh nonce per
request: `proxy.ts` builds it with `buildCsp()` from `lib/csp.ts` and sets it on
the request (Next reads the nonce from there and stamps its own scripts — from
either header name) and on the response. Scripts: `'self' 'nonce-…'
'strict-dynamic'`, no host list, no `'unsafe-inline'`; the GA4 `<Script>`s get
the nonce in `app/layout.tsx`. Styles allow `'unsafe-inline'` (React style
attributes). `/admin` alone adds `worker-src blob:` and `'unsafe-eval'` for
heic2any. API responses, which the proxy skips, get a static
`default-src 'none'; frame-ancestors 'none'` from `next.config.ts` (`API_CSP` in
`lib/security-headers.ts`) — ZAP's rule 10038 flagged them once the page policy
was enforced. `frame-src` allows `vercel.live` for the Vercel toolbar's comments
frame (injected only for a signed-in team member; its script carries the
nonce). It is **enforcing** (`ENFORCE = true`, since 28 Sep 2026, after a day
of report-only on real traffic showed only the toolbar frame and GA's country-
domain audience ping). Violations still POST to `/api/csp-report` and aggregate
into `CspViolation` — read that table when something on a page stops working,
and add the host to `buildCsp()` rather than flipping `ENFORCE` back.
`e2e/csp.spec.ts` fails on any violation across the public pages, the signed-in
admin and a playing film, and ZAP's rule 10055 now reviews the policy itself.
Things learned the hard way:
- The proxy must **not** run on server actions (`missing: next-action` in its
  matcher) — with it, the admin's toggle POSTs never got a response.
- The proxy's matcher skips image files **by extension**. It once skipped the
  `photographs` folder by name, which also skipped the `/photographs` pages, and
  the violation test passed because a page with no policy has none to raise; it
  now requires the policy on every page too.
- Use `report-uri` only. With `report-to` present too, Chrome uses the
  Reporting API alone, and it never delivered a report in testing.
- A new third-party script, image, iframe or `fetch` host needs a line in
  `buildCsp()`, or it becomes a violation (and, once enforcing, a breakage).
Before using a new browser feature (e.g. "locate me" on the map), relax the
matching Permissions-Policy entry or it will silently fail.

**OWASP ZAP baseline scan**: the last step of `e2e.yml`, on pushes to `main`
only (not PRs, to save Actions minutes), restarts the CI build
and runs ZAP's passive scan against it (never production; image pinned to a
version). A finding therefore turns `main` red rather than blocking the PR. Every finding fails the job unless `.zap/rules.tsv` accepts it, and
every line there carries its reason. ZAP matches on rule id only, so accepting
one alert accepts its siblings (COEP/COOP/CORP share 90004); where that hides
something, a test of our own checks it instead. When a new finding appears, fix
it if you can — the first run's four were all fixed — and only then add a line.
It can't be run locally without Docker; the report is the `zap-report` artifact
on the run, and a summary is on the run page.

**Active scan, weekly** (`.github/workflows/zap-full.yml`, Sundays and on PRs
that change it): ZAP's full scan attacks the pages, and its API scan attacks
the JSON endpoints described in `.zap/public-api.yaml`, all against a CI build
and throwaway database; a background loop empties `FormRateLimit` so the
attacks aren't all 429s, and `RESEND_BASE_URL` points email at a local stub
that accepts everything, so a valid request completes and a 500 is a real crash. Findings share `.zap/rules.tsv`. A new public JSON
endpoint belongs in `public-api.yaml`, or the scan never reaches it. On a
scheduled run a failure opens an issue.

**Server actions are checked for auth by calling them.**
`__tests__/server-actions-auth.test.ts` imports every `"use server"` module,
calls each export with no session, and fails if one doesn't redirect to sign
in or touches the database first. Only the sign-in flows are in its `PUBLIC`
list; a new action is covered without editing the test. Add a new
`"use server"` file to its `MODULES`.

**`/.well-known/security.txt`** (`lib/security-txt.ts`) is how anyone who
finds a problem reports it. `Expires` is a year from the last deploy.

**Every form posts.** The forms are sent by `fetch`, but before hydration (or
with JavaScript off) the browser submits them itself, and a form without
`method="post"` puts the name, email and message in the URL — which GA4 records.
ZAP caught the contact form doing it; `e2e/forms.spec.ts` checks every form.

### Admin sign-in (passkeys)

The admin signs in with a **passkey** (WebAuthn via `@simplewebauthn/server` + `/browser`, pinned; `lib/passkey.ts`, `app/actions/passkey.ts`, `/admin/security` to add or remove them). One admin, so no usernames: sign-in asks the browser for any passkey it holds for this site (discoverable credentials, user verification required). The challenge lives in the encrypted session cookie, single use, five minutes. `AdminPasskey` stores only public keys.

- **Once any passkey exists, the password is refused** (`passwordLoginAllowed`), before it's even compared, with the same message either way. Removing the last passkey switches the password back on.
- **Break-glass:** `ADMIN_PASSWORD_LOGIN=1` in Vercel re-enables the password (the login page says so). It needs the owner's Vercel account; remove it once a new passkey is registered.
- **rpID** is the registrable domain (`georgianartist.com`, from `siteConfig.url`), so www. and the bare domain share passkeys; `localhost` locally and in CI; any other host is refused. Changing the domain orphans every passkey, so plan a re-registration.
- **CI sets `ADMIN_PASSWORD_LOGIN=1`** so the other admin specs can keep signing in with the password while `e2e/zz-admin-passkey.spec.ts` (a real ceremony with Chromium's virtual authenticator) has a passkey registered; the refusal itself is unit-tested (`__tests__/passkey.test.ts`). Setup and the spec clear `AdminPasskey`.
- Failed passkey sign-ins count against the same Postgres lockout as the password did.

### Admin login limiter

`lib/rate-limit.ts` counts **failed** logins per client IP in the `FormRateLimit` table (HMAC key via `limitKey("ip:login", ip)`): five in fifteen minutes locks the address out. It moved from an in-memory Map in September 2026 — that only slowed an attacker who happened to hit the same instance. Failures, not attempts, so the E2E suite's dozens of sign-ins don't lock it out; a successful login clears the row. It **fails open** if the database is down (the admin locked out of a broken site is who has to fix it), and `e2e/global-setup.ts` clears the table before each run.

`/api/track` is limited the same way (`TRACK_LIMIT`, 120 events per address per ten minutes), failing open so an outage never loses a real visitor's event.

### Public forms

`/api/buy`, `/api/contact` and `/api/book` each email a confirmation to the
address typed in, **from this domain** — so it passes SPF and DKIM. Until
September 2026 the order form mailed back the title and price it was posted,
and every confirmation opened with the posted name: anyone could send "Your
enquiry for <any text>" to anyone, with no limit. Three rules now:

- **The server decides what an order is.** The browser sends ids and choices;
  `resolveOrder()` in `lib/order.ts` looks up titles and prices and refuses
  hidden or sold-out works, unsold sizes and malformed packs.
- **Confirmations repeat nothing the visitor typed** — not even their name.
  The owner's copy still has everything.
- **Rate limits in Postgres** (`lib/form-rate-limit.ts`, table
  `FormRateLimit`), because an in-memory limiter is per serverless instance:
  per IP and form (429, nothing sent), per recipient and a daily global cap
  (only the confirmation is held back, so a real enquiry still reaches the
  owner). Each check is one raw SQL statement — an upsert through Prisma needs
  a transaction the Neon HTTP adapter doesn't have. Keys are HMACs, never raw
  IPs or addresses. The per-IP check fails open if the database is down (don't
  lose a sale); the confirmation checks fail closed.

- **Size and type limits** (`lib/form-input.ts`): a body over 32 KB is a 413,
  a field over its `FIELD_MAX` or not a string is a 400, before anything is
  sent. None existed until the abuse tests looked (September 2026): a message
  of any length went to the owner's inbox, and `"name": {}` crashed into a 500.

- **A refused email is a failure, not a success** (`lib/form-send.ts`). Resend's
  `emails.send()` resolves to `{ data: null, error }` instead of throwing, and
  the routes used to `await Promise.all(sends)` and answer OK regardless.
  `sendForm()` sends the owner's copy first; if Resend refuses it, the route
  answers 500 and no confirmation goes out promising a reply to a message
  nobody received. A refused confirmation is only logged.
- **The routes record the outcome, not the page** (`lib/server-event.ts`). A
  caught bot gets the same `{ ok: true }` as a person, deliberately, so the page
  can't tell them apart. It used to report "Contact form sent" anyway: 14 bots
  between June and September 2026, none of which sent an email. Now
  `contact_submit` and `buy_submit` are written by the route once the owner's
  email has gone, honeypot and too-fast submissions as `spam_blocked`, and
  `/api/track` no longer accepts either submit action from a browser.

`__tests__/form-email-abuse.test.ts` calls the three real handlers and fails if
a confirmation carries posted text, anything is sent over a limit, a caught
bot is counted as a message, or a refused email is reported as sent. E2E runs
come from one address, so `e2e/global-setup.ts` clears `FormRateLimit` first.

### Email forwarding

`info@georgianartist.com` forwards to `james@portman.ca` via Squarespace Email Forwarding (MX records pointing to Mailgun). Manage forwarding rules at Squarespace → Domains → georgianartist.com → DNS Settings → Manage Rules.

### Analytics

Google Analytics 4 (ID: `G-KKZVBB0PWX`, set as `analytics.ga4` in `data/siteConfig.ts`) is loaded via `next/script` in `app/layout.tsx` — **only on the production deployment** (`VERCEL_ENV=production`, `lib/ga.ts`). CI's Playwright browsers used to load it too and showed up in GA as thousands of "users" from Azure data-centre towns (Flint Hill, Des Moines, Moses Lake, Chicago); local builds and dev are excluded the same way. **Advertising is off** through consent-mode defaults (`GA_CONSENT_DEFAULTS`: `ad_storage`, `ad_user_data`, `ad_personalization` denied; analytics granted), queued before `config`. With ad storage allowed, GA pings `www.google.<visitor's country>/ads/ga-audiences`, which no CSP can allowlist (.ca, .com.mx and .nl so far); turning Google Signals off in the property and in `config` did not stop it. The cost is GA4's demographics and remarketing, which a site with no ads doesn't use. Because CI no longer loads GA, the E2E CSP test no longer exercises Google's hosts — a new GA endpoint shows up in production's `CspViolation` reports instead.

There is also a **first-party tracker** — `components/AnalyticsTracker.tsx` posts to
`app/api/track`, which enriches server-side (UA, Vercel edge geo) and writes one
`AnalyticsEvent` row. No raw IP is stored; visitors are counted by an anonymous httpOnly
cookie (`gba_vid`). The dashboard is `/admin/analytics`. Form outcomes don't come
from the tracker: the form routes write them through the same `writeEvent()`
(see [Public forms](#public-forms)). What the browser may report is one list,
`BROWSER_ACTIONS` in `lib/analytics.ts`, and `/api/track` builds its allow-list
from it. It used to keep its own, and the newsletter sign-up and the sold-out
"Ask about something similar" click were dropped for months because nobody
added them there (`__tests__/track-actions.test.ts`).

**Excluding your own browsing** — the artist's own visits were the single largest "city"
in the dashboard, more events than any real audience. `ExcludedVisitor` holds the
`gba_vid` values that aren't counted, and **`/api/track` drops them at ingest** rather
than the dashboard filtering them: the dashboard runs a dozen-odd queries, several raw
SQL, and a filter each one has to remember is a trap — the next query added silently
counts the owner again. Add a browser with "Don't count this browser" on the dashboard
(the cookie is httpOnly at path `/`, so the server action can read it without anyone
knowing their own id); do it once per browser and device. Excluding stops new events;
`npm run analytics:purge-excluded -- --commit` removes the ones already recorded, after
archiving them.

**Do not filter by city.** It is the obvious approach and it is wrong twice over: Wasaga
Beach is a real Georgian Bay town whose residents are plausible customers, and the
owner's own cookie has been seen from Ottawa and Little Current. The cookie follows the
person; the city does not. A lookup failure counts the event — never lose a real
visitor's data to a tracking optimisation.

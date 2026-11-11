import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/data/siteConfig";
import inventory from "@/data/test-inventory.json";
import { ExpandAll, OpenSectionOnHash } from "./SectionToggles";
import {
  CoverageGrid,
  DefenceLayers,
  ImageJourney,
  InstagramLifecycle,
  MutationScores,
  RecoveryLayers,
  SystemMap,
  TableMap,
  TestingLayers,
  WeekOfAutomation,
} from "./figures";

// Counted from the list the build writes (scripts/test-inventory.mjs), so the
// numbers quoted below can't go stale the way the hand-typed ones did.
const testCount = (groups: { tests: unknown[] }[]) => groups.reduce((n, g) => n + g.tests.length, 0);
const UNIT_TESTS = testCount(inventory.unit);
const E2E_TESTS = testCount(inventory.e2e);

export const metadata: Metadata = {
  title: `Architecture | ${siteConfig.brand}`,
  description:
    "A technical deep-dive for lead engineers: the request path, CI/CD topology, data model, write flows, media pipeline, the guards that fail the build, security, durability and a repository map.",
  alternates: { canonical: "/architecture" },
};

/*
 * This page makes factual claims about how the site is built, so it goes stale
 * whenever the build changes. CLAUDE.md's "Before opening a PR" table says
 * which section to re-read for which kind of change.
 */

export default function ArchitecturePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <OpenSectionOnHash />
      <h1 className="text-2xl font-semibold text-gray-800 mb-1">Architecture</h1>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
        <p className="text-gray-600 text-lg">A deep-dive into how this site is built.</p>
        <ExpandAll />
      </div>

      {/* ── 1 · Executive summary ────────────────────────────────── */}
      <Section n={1} id="summary" title="Executive summary">
        <SystemMap />
        <p>
          A storefront for paintings and photographs: a filterable gallery,
          a page per work with print sizes and prices, a map of where each work was made,
          time-lapse films of the paintings being made, a gift-shop builder, and an admin Content Management System
          behind a password. Prints are ordered by enquiry: the order form emails the artist and
          the sale completes by email, so the site takes no payments and holds no card data.
        </p>
        <p>
          It runs on fully managed infrastructure (Next.js on Vercel, Postgres on Neon, media
          on Vercel Blob, email through Resend) and is run by one person with no developer on
          call. The design leans accordingly: mistakes are made to fail the build rather than
          reach production, and scheduled jobs email when something goes wrong rather than
          waiting on a dashboard someone has to watch.
        </p>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Chip term="Framework" value="Next.js 16 · App Router" />
          <Chip term="Runtime" value="React 19 · Node" />
          <Chip term="Data" value="Prisma 7 · Neon Postgres" />
          <Chip term="Host" value="Vercel · Crons · Blob" />
          <Chip term="Email" value="Resend" />
          <Chip term="Styling" value="Tailwind CSS v4" />
          <Chip term="Tests" value="Vitest · fast-check · Playwright · axe · ZAP · Stryker" />
          <Chip term="Captions" value="Claude API" />
        </dl>
      </Section>

      {/* ── 2 · Operations ─────────────────────────────────────────── */}
      <Section n={2} id="operations" title="Operations">
        <WeekOfAutomation />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <OpsCard title="Tests gate every deploy">
            Every pull request runs a dependency audit, the full unit suite, a production build and the Playwright
            suite against a throwaway Postgres. Every Sunday an active security scan attacks a CI
            build of the site. Vercel&rsquo;s production build runs the unit suite
            again, so a failing test stops the deploy even if it slipped past review.
          </OpsCard>
          <OpsCard title="Four scheduled jobs">
            Vercel Crons: a health check every hour, a catalogue backup every six hours, a
            prune of old analytics events and expired rate-limit counters at 05:30 UTC, and
            Instagram publishing Mon/Wed/Fri at 15:00 UTC. Each route rejects any request without
            the <Code>CRON_SECRET</Code> bearer token.
          </OpsCard>
          <OpsCard title="Failures email the owner">
            Every hour the health check confirms the database answers and four real pages
            render on the live domain, and emails through Resend (<Code>lib/notify.ts</Code>) once
            when something breaks and once when it recovers, never on every run. After every
            production deploy a GitHub Action confirms the new commit is live and the key pages
            work, and opens an issue if not. Every uncaught server error (a page that fails to
            render, a route handler that throws) is counted in <Code>ErrorReport</Code> with its
            stack, emailed the first time and then once a day per kind (<Code>instrumentation.ts</Code>).
            So is one in a visitor&rsquo;s browser (the gift-shop builder, the map, a click
            that throws), posted to <Code>/api/client-error</Code>; since anyone can post
            there, those emails are capped at ten a day. From outside Vercel, Better Stack
            checks the home page and <Code>/api/health</Code>{" "}every three minutes and emails if
            either stops answering, which catches what nothing on Vercel can: Vercel itself, the
            domain or the certificate going down. The Instagram job emails if its
            token is invalid, a publish fails, or a queued caption has gone stale; the backup job,
            if a snapshot can&rsquo;t be written.
          </OpsCard>
          <OpsCard title="Two kinds of analytics">
            Google Analytics 4 on the production deployment only (CI&rsquo;s browsers once
            counted as thousands of visitors), with advertising consent denied by default (no
            remarketing audiences, and no per-country Google domain the CSP could never list),
            plus a first-party tracker
            writing one row per event to Postgres
            (no raw IP stored), with its own dashboard. The owner&rsquo;s browsers are excluded at
            ingest, not filtered afterwards.
          </OpsCard>
        </div>
      </Section>

      {/* ── 3 · Runtime request path ───────────────────────────────── */}
      <Section n={3} id="request-path" title="Runtime request path">
        <p>
          Every page is a React Server Component rendered on request, reading through a single
          Prisma client. The catalogue pages say so (<Code>dynamic = &quot;force-dynamic&quot;</Code>);
          the prose pages (About, FAQ, this one) render per request anyway, because the root
          layout reads the request headers for the CSP nonce, and nothing below a layout that
          does so can be prerendered. Interactivity is confined to client-component islands (the gallery&rsquo;s
          filter and sort, the size selector and order form, the map, the film player), and
          writes go through route handlers (public forms) or server actions (the admin).
        </p>
        <Diagram label="Runtime request path">
          <Tier title="Browser">
            Server-rendered HTML · client islands: gallery filter/sort, size selector + order
            form, Leaflet map, click-to-load film player · first-party analytics beacon
          </Tier>
          <Down />
          <Tier title="Next.js 16 on Vercel (Node runtime)" accent>
            <strong>Proxy</strong> gives each page request a fresh CSP nonce ·{" "}
            <strong>Server Components</strong> render every page per request ·{" "}
            <strong>Route handlers</strong> <Code>/api/buy</Code> <Code>/api/contact</Code>{" "}
            <Code>/api/book</Code> <Code>/api/track</Code> <Code>/api/og-image</Code>{" "}
            <Code>/api/csp-report</Code> <Code>/api/version</Code> <Code>/api/health</Code>{" "}
            <Code>/api/cron/*</Code> · <strong>Server actions</strong> for the admin (session-checked)
          </Tier>
          <Down />
          <Tier title="Prisma 7 client (module singleton)" accent>
            Adapter chosen by URL: <Code>PrismaNeonHttp</Code> for Neon (one HTTPS request per
            query, no connection pool to exhaust) or <Code>PrismaPg</Code> for a plain Postgres
            (CI and local E2E)
          </Tier>
          <Down />
          <Tier title="Neon Postgres (serverless)" accent>
            Product · MakingOf · InstagramPost · AnalyticsEvent · ExcludedVisitor · FormRateLimit ·
            HealthState · CspViolation · ErrorReport · AdminPasskey
          </Tier>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-600 mt-6 mb-2">
            Alongside the database
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Side title="Repository (/public)" sub="catalogue images, served through the next/image optimiser" />
            <Side title="Vercel Blob" sub="public: catalogue, films · private: uploads, collectors' photos, backups" />
            <Side title="Resend" sub="order, contact and booking emails; failure alerts" />
            <Side title="Kit" sub="newsletter sign-up, posted from the browser" />
            <Side title="OpenStreetMap tiles" sub="the Locations map" />
            <Side title="Meta Graph API · Claude API" sub="Instagram publishing · caption drafts" />
          </div>
        </Diagram>
        <p>
          Every page renders per request, because the CSP nonce has to be fresh, but its
          catalogue reads come from Next&rsquo;s data cache (<Code>lib/catalogue-cache.ts</Code>),
          not Neon. Each admin write expires the cache, so an edit is live on the next load; a
          script&rsquo;s edit shows within the hour, or at once after <em>Refresh site</em> in
          the admin. Each deployment starts with an empty cache, since the data cache outlives a
          deploy: in October 2026 a new build served its predecessor&rsquo;s image paths, which it
          had just deleted, until the cache was cleared by hand. Neon on the Free plan suspends after five
          idle minutes, and before the cache the first visitor after a quiet spell waited for it
          to wake; now Neon is asked only after a change. With the database stopped outright, a
          local production build still served every catalogue page from the cache in under
          40&nbsp;ms. Prerendering the prose pages was the alternative, and was rejected: a
          static page can&rsquo;t carry a per-request nonce, so it would need a weaker policy for
          pages that do no database work anyway. Functions run in Vercel&rsquo;s default region
          (Washington, D.C.), next to the database in AWS <Code>us-east-1</Code>.
        </p>
      </Section>

      {/* ── 4 · CI/CD ──────────────────────────────────────────────── */}
      <Section n={4} id="cicd" title="CI/CD & deployment topology">
        <p>
          All work lands through pull requests into <Code>main</Code>. GitHub Actions
          (<Code>.github/workflows/e2e.yml</Code>) runs on every pull request and every push to{" "}
          <Code>main</Code>; Vercel deploys <Code>main</Code> to production on merge.
        </p>
        <Diagram label="CI/CD pipeline">
          <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
            <Stage title="Feature branch" sub="local: unit tests, typecheck, E2E on a throwaway Postgres" />
            <Right />
            <Stage
              title="GitHub Actions"
              sub="Postgres 16 service → npm ci → audit-ci → lint → npm run build → seed → restore drill → Playwright + axe → ZAP scan (main only) · in parallel: Gitleaks, Semgrep"
              accent
            />
            <Right />
            <Stage title="Merge to main" sub="squash merge" />
            <Right />
            <Stage
              title="Vercel build"
              sub="prisma generate → vitest → test inventory → database check → prisma db push → image check → next build"
              accent
            />
            <Right />
            <Stage title="Production" sub="CDN + Node functions → Neon" />
            <Right />
            <Stage title="Smoke test" sub="new commit live? key pages, headers, sitemap" accent />
          </div>
        </Diagram>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>One build script everywhere.</strong> <Code>npm run build</Code> is{" "}
            <Code>prisma generate &amp;&amp; vitest run &amp;&amp; (database check) &amp;&amp; prisma db push &amp;&amp; next build</Code>,
            in CI and on Vercel alike, so the unit suite gates production and not only pull
            requests. The tests run before the schema is pushed, so a change that fails them
            never reaches the production database. Between the tests and the build it writes the list of every test that{" "}
            <Code>/architecture/tests</Code>{" "}renders; CI fails if the committed copy is stale.
          </li>
          <li>
            <strong>Preview deployments are opt-in, and can&rsquo;t reach production.</strong>{" "}
            <Code>vercel.json</Code>{" "}builds a non-production branch only when{" "}
            <Code>ENABLE_PREVIEWS=1</Code>, and every preview sits behind Vercel Authentication.
            The risk is the database: the Neon integration hands previews the same{" "}
            <Code>DATABASE_URL</Code>{" "}as production, so a preview would push its schema to, and
            its admin would write to, the live catalogue. The guard (<Code>lib/db-guard.ts</Code>)
            refuses a preview&rsquo;s database unless it is a different Neon endpoint from{" "}
            <Code>PRODUCTION_DATABASE_HOST</Code>, and a build step runs that check before{" "}
            <Code>prisma db push</Code>. With Neon&rsquo;s preview branching on, each preview gets
            its own branch of production&rsquo;s data. Instagram publishing is production-only.
          </li>
          <li>
            <strong>Schema changes ship with the code.</strong> <Code>prisma db push</Code> runs on
            every build, after the unit tests, so the column exists before the code that reads it
            is served. There is
            no migrations directory: changes must be additive or nullable, and anything
            destructive needs a hand-written plan.
          </li>
          <li>
            <strong>Every production deploy is checked after it lands.</strong> A failed Vercel
            build keeps serving the previous deployment, so every page still returns 200 and
            nothing looks wrong, which is how one broken deploy went unnoticed.{" "}
            <Code>.github/workflows/smoke.yml</Code>{" "}runs on Vercel&rsquo;s deployment status:
            if the deploy failed it says so; if it succeeded,{" "}
            <Code>scripts/smoke.mjs</Code>{" "}polls <Code>/api/version</Code>{" "}until the new
            commit is the one answering on the live domain, then checks nine pages render the
            storefront with their policy and headers, and the sitemap and robots file. Either
            failure opens a GitHub issue, since a run started by Vercel&rsquo;s bot has nobody to
            email. Its first run found the photograph pages were being served with no
            Content-Security-Policy at all.
          </li>
          <li>
            <strong>E2E cannot touch production.</strong> The Playwright suite creates, edits and
            deletes rows. <Code>e2e/db-guard.ts</Code> refuses to start unless{" "}
            <Code>DATABASE_URL</Code> points at a local host (added after a local run once edited
            the live catalogue).
          </li>
          <li>
            <strong>Nor can a laptop, by default.</strong> The Prisma singleton calls{" "}
            <Code>lib/db-guard.ts</Code> before it connects: off Vercel, a remote database is
            refused unless its host is named in <Code>DATABASE_ALLOW_HOST</Code>. Local work uses
            a Neon dev branch named that way; running something against production means typing
            production&rsquo;s host for that one command. &ldquo;Off Vercel&rdquo; isn&rsquo;t read
            from <Code>VERCEL=1</Code> alone, because <Code>vercel env pull</Code> writes that into
            the file it downloads: scripts ignore it, the build check also wants Vercel&rsquo;s{" "}
            <Code>CI=1</Code>, and the dev server never counts as a deployment.
          </li>
          <li>
            <strong>Mutation testing, scoped to the change.</strong>{" "}
            <Code>mutation.yml</Code>{" "}(§8) runs on a pull request only for the critical modules
            it touches, and on all of them weekly. ZAP&rsquo;s active scan (
            <Code>zap-full.yml</Code>, §10) is weekly only.
          </li>
        </ul>
      </Section>

      {/* ── 5 · Data model ─────────────────────────────────────────── */}
      <Section n={5} id="data-model" title="Data model">
        <TableMap />
        <p>
          Ten tables. Paintings and photographs share <Code>Product</Code>, distinguished by{" "}
          <Code>type</Code>. Other tables refer to a work by its id rather than a foreign key: a
          film can be published before its painting is in the catalogue and links itself up once
          the product exists, and analytics events outlive a deleted work.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Entity name="Product" note="The catalogue, the site's source of truth">
            <Field k="id" v="PK, permanent; Blob names, analytics and Instagram key on it" />
            <Field k="slug" v="the URL; null means the id is the URL. A rename moves it, never the id" />
            <Field k="type" v={'"painting" | "photograph"'} />
            <Field k="title · category · description" v="copy" />
            <Field k="image · blurDataURL" v="Blob URL · base64 placeholder" />
            <Field k="mockupImage" v={'the "In a Room" mockup on Blob; cleared when the image is replaced'} />
            <Field k="sizeType · price" v="keys into the size/price table in data/products.ts" />
            <Field k="inspirationImage · Lat · Lng" v="the source photo and where it was taken" />
            <Field k="homePhoto · homePhotoCredit" v="a collector's photo, stored stripped" />
            <Field k="isNew · onSale · soldOut · visible" v="merchandising flags" />
            <Field k="sortOrder" v="drag-to-reorder position" />
            <Field k="naturalWidth · naturalHeight" v="photographs: panorama detection" />
          </Entity>
          <Entity name="ProductSlug" note="Retired URLs, so a renamed work keeps its old links">
            <Field k="slug" v="PK, an old /products/ or /photographs/ address" />
            <Field k="productId" v="the work it redirects to, permanently (308)" />
          </Entity>
          <Entity name="InstagramPost" note="A publishing queue with a state machine">
            <Field k="status" v="pending → approved → posting → posted | skipped" />
            <Field k="type · productId" v="painting, photograph, reel, voting, press" />
            <Field k="imageUrl · caption" v="media and the approved text" />
            <Field k="scheduledAt" v="next free Mon/Wed/Fri slot, set on approval" />
            <Field k="mediaFingerprint" v="etag|content-length when the caption was written" />
            <Field k="instagramId · postedAt" v="set by the Graph API on publish" />
            <Field k="containerId · postingStartedAt" v="the attempt's media container, stored before publishing; the idempotency key" />
          </Entity>
          <Entity name="MakingOf" note="Time-lapse films of the paintings">
            <Field k="videoUrl · posterUrl" v="Blob; too large to commit" />
            <Field k="productId" v="optional; links up when the work exists" />
            <Field k="description · seconds" v="caption and running time" />
            <Field k="visible · sortOrder" v="publishing and order" />
          </Entity>
          <Entity name="AnalyticsEvent" note="One row per page view or action">
            <Field k="kind · action" v="pageview | action (buy_open, product_click, …)" />
            <Field k="path · productId · referrer" v="what, and from where" />
            <Field k="visitorId" v="anonymous first-party cookie" />
            <Field k="device · browser · os" v="parsed server-side from the user agent" />
            <Field k="country · city" v="coarse, from Vercel edge headers; no IP" />
            <Field k="indexes" v="createdAt · kind+createdAt · action · productId · visitorId" />
          </Entity>
          <Entity name="ExcludedVisitor" note="Browsers not counted (the owner's)">
            <Field k="visitorId" v="PK; the gba_vid cookie value" />
            <Field k="label" v={'free text, e.g. "desktop Chrome"'} />
          </Entity>
          <Entity name="FormRateLimit" note="Counters that stop the forms being a mail relay">
            <Field k="key" v="PK; an HMAC of an IP or email address, never the raw value" />
            <Field k="windowStart · count" v="fixed window, reset in the same statement" />
          </Entity>
          <Entity name="HealthState" note="The health check's last result (one row)">
            <Field k="failing · changedAt" v="so it emails on a change, and knows how long it lasted" />
            <Field k="checkedAt · detail" v="when it last ran, and its full report" />
          </Entity>
          <Entity name="CspViolation" note="Policy violations browsers report, aggregated">
            <Field k="directive · blocked · page" v="what, from which origin, on which page" />
            <Field k="count · firstSeen · lastSeen" v="one row per kind; unseen for 30 days → pruned" />
          </Entity>
          <Entity name="ErrorReport" note="Uncaught errors, server and browser, one row per kind">
            <Field k="digest" v="PK; Next's error digest, or a hash of the message" />
            <Field k="message · path · kind" v="what threw, where, and in a render, route, action or the browser" />
            <Field k="stack" v="the top of the stack from the first occurrence, capped at 2,000 characters" />
            <Field k="count · alertedAt" v="repeats are counted; the first is emailed at once, then once a day per kind" />
          </Entity>
          <Entity name="AdminPasskey" note="The admin's passkeys; once one exists, the password stops working">
            <Field k="id" v="PK, the credential ID the authenticator presents" />
            <Field k="publicKey · counter" v="the public half only; the private key never leaves the device" />
            <Field k="label · deviceType · backedUp" v="which device, and whether it syncs (iCloud Keychain)" />
            <Field k="lastUsedAt" v="so a lost or unused device is easy to spot and remove" />
          </Entity>
          <Entity name="In code, not the database" note="Shared, versioned configuration">
            <Field k="data/siteConfig.ts" v="brand, artist, domain, contacts, IDs" />
            <Field k="data/products.ts" v="SizeType union and the print price table" />
            <Field k="data/giftShop.ts" v="gift-shop products and image counts" />
            <Field k="app/globals.css @theme" v="brand colour tokens" />
          </Entity>
        </div>
      </Section>

      {/* ── 6 · Key flows ──────────────────────────────────────────── */}
      <Section n={6} id="flows" title="Key flows">
        <InstagramLifecycle />
        <Flow title="Order a print, a card or a gift pack">
          The Buy Now form posts only ids and choices (which work, which size, framed or not, which
          images in a pack) to <Code>/api/buy</Code>. The server looks up the title and price
          itself (<Code>lib/order.ts</Code>) and refuses a hidden or sold-out work, a size the
          work isn&rsquo;t sold in, or a pack with the wrong images, so no posted text can reach an
          email. It then sends the enquiry to the artist, with <Code>Reply-To</Code> set to the
          buyer, and a confirmation to the buyer. No payment is taken on the site. Contact and booking
          (<Code>/api/contact</Code>, <Code>/api/book</Code>) follow the same pattern. All three
          forms carry a hidden honeypot field; a submission that fills it gets a success response
          and sends nothing, so a bot learns nothing from being caught. Because that reply is
          identical, the page can&rsquo;t tell a sent message from a caught bot, so the routes
          record the outcome themselves (<Code>lib/server-event.ts</Code>): &ldquo;Contact form
          sent&rdquo; and &ldquo;Enquiry submitted&rdquo; only once the artist&rsquo;s email has
          gone, &ldquo;Spam blocked&rdquo; for the rest. When the page counted them, fourteen bots
          showed up as contact messages. Resend refuses an email by returning an error rather than
          throwing, so every route checks it (<Code>lib/form-send.ts</Code>). If the
          artist&rsquo;s copy is refused, the visitor gets an error, not a confirmation for a
          message nobody received.
        </Flow>
        <Flow title="Add or edit a work (admin)">
          In the browser, the image is converted from HEIC if needed, downscaled to 2,400px JPEG
          and given a blur placeholder, which keeps uploads under the 4.5&nbsp;MB server-action
          body limit. The server action checks the session, embeds the copyright notice in EXIF
          and XMP (pure JS; no exiftool in a serverless function), uploads to Blob under{" "}
          <Code>paintings/</Code> or <Code>photographs/</Code>, and writes the row. The work is
          live on the next request.
        </Flow>
        <Flow title="Attach a collector&rsquo;s photo">
          A photo of a work hanging in a buyer&rsquo;s home replaces the generated room mockup on
          that work&rsquo;s page. It is re-encoded with sharp, which drops all metadata (a phone
          photo taken at home carries that home&rsquo;s GPS), and it fails closed: a file that
          can&rsquo;t be read is refused, never published as-is. It gets no artist copyright,
          because it isn&rsquo;t the artist&rsquo;s photograph.
        </Flow>
        <Flow title="Delete a work or replace an image">
          Before deleting a Blob object, <Code>lib/blob-cleanup.ts</Code> counts references
          across products, Instagram posts and films; a file still in use elsewhere is kept.
        </Flow>
        <Flow title="Publish to Instagram">
          Captions are drafted by the Claude API into <Code>pending</Code>; approving one assigns
          the next free Mon/Wed/Fri slot. The cron checks the token, then puts the post back to{" "}
          <Code>pending</Code>{" "}if its work has since been hidden or deleted (so a work taken down
          never posts to a page that 404s), or if the file changed since the caption was written:
          it re-reads the media&rsquo;s etag and length, because a repaint replaces the file behind
          an unchanged URL. Images
          outside Instagram&rsquo;s 0.8–1.91 aspect range are letterboxed to a temporary Blob
          copy. Publishing is two Graph API calls (create a container, then publish it), with
          the row held in <Code>posting</Code> in between. The container&rsquo;s id is stored on the
          row before publishing, and Meta publishes a container at most once, so it is the
          idempotency key: a publish that errors, or a row a previous run left behind, is settled
          by the container&rsquo;s status (published is recorded, ready is published with the same
          container, expired goes back to the queue). Only when Meta can&rsquo;t say does a row
          wait for a person. The sequence is pinned write by write (
          <Code>__tests__/instagram-publish-flow.test.ts</Code>): which post each step touches and
          what it sets, the order claim → container → publish → record, the retry waits on a fake
          clock, and who each alert reaches.
        </Flow>
        <Flow title="Record an analytics event">
          The tracker posts to <Code>/api/track</Code>, which drops the event if the host is
          localhost or a preview deployment, the user agent is a bot or headless browser, or the
          visitor is excluded. Otherwise it parses the user agent, takes coarse location from
          Vercel&rsquo;s headers, sets an anonymous httpOnly <Code>gba_vid</Code> cookie and writes
          one row. A daily cron deletes events older than 25 months with a single{" "}
          <Code>deleteMany</Code>.
        </Flow>
        <Flow title="Sell out an edition">
          <Code>soldOut</Code> is distinct from <Code>visible</Code>: a sold-out work keeps its page
          and stays indexed, its JSON-LD availability becomes <Code>SoldOut</Code>, prices and the
          order form give way to an enquiry panel, and it moves to its own section at the end of
          the gallery and out of the gift shop.
        </Flow>
      </Section>

      {/* ── 7 · Media pipeline ─────────────────────────────────────── */}
      <Section n={7} id="media" title="Media pipeline">
        <ImageJourney />
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Two Blob stores, public and private.</strong> Admin uploads (a new
            work&rsquo;s image, inspiration photos, collectors&rsquo; photos) go to a{" "}
            <em>private</em> store and are held as <Code>/media/&hellip;</Code> paths, served by{" "}
            <Code>app/media</Code> only while a visible work uses the file, or to the signed-in
            admin. A work uploaded hidden can&rsquo;t be seen before it&rsquo;s published, and
            hiding it, or removing a collector&rsquo;s photo, stops the file being served instead
            of leaving it readable by anyone with the URL (within the caches: ten minutes at the
            CDN, a few hours in the image optimiser). The route serves only plain files in the
            upload folders, so the backups in the same store are out of its reach. Without the
            private store&rsquo;s token, uploads go to the public store as before.
          </li>
          <li>
            <strong>Blob is the catalogue&rsquo;s one home.</strong> The original works used to
            be committed under <Code>public/</Code>; in October 2026 a one-off script copied them to
            Blob under <Code>catalogue/</Code>, repointed every row, and the 67 files left the
            repository. It replaced two homes and a manual commit step, and stopped git history
            growing with every revised image (it had reached about 250&nbsp;MB for 44&nbsp;MB of
            current images). A build step (<Code>scripts/assert-catalogue-on-blob.ts</Code>) stops
            the deploy if any row still names an old repository path, since a broken image
            fails nothing on its own. Nothing deletes a <Code>catalogue/</Code> file
            automatically: the pruner skips the folder, and an admin edit never releases one.
            Everything is served through the <Code>next/image</Code> optimiser, resized per
            viewport.
          </li>
          <li>
            <strong>Blur-up placeholders</strong> come from <Code>data/blurs.ts</Code> for the seeded
            catalogue, or the per-product <Code>blurDataURL</Code>{" "}made at upload. The generated file
            is stripped of metadata, and a unit test fails the build if metadata returns. It once
            took the placeholder file from 46&nbsp;KB to 200&nbsp;KB without anyone noticing.
          </li>
          <li>
            <strong>Copyright metadata</strong> has two writers that agree: an exiftool script for
            committed files (EXIF, IPTC, XMP) and a pure-JS writer for uploads (EXIF, XMP). Both
            change metadata only, never pixel data; the notice itself is defined once, in{" "}
            <Code>lib/copyright.ts</Code>.
          </li>
          <li>
            <strong>Films stay on Blob</strong> as MP4s with the index at the front (faststart),
            so playback begins before the file has fully arrived. The page renders a still
            poster; no <Code>&lt;video&gt;</Code> element exists until the visitor presses play, so
            no film data is downloaded unless asked for.
          </li>
          <li>
            <strong>Share images</strong> come from <Code>/api/og-image</Code>, which composes a
            card with sharp from a work that is currently visible. A hard-coded image could name a
            work that has since been hidden.
          </li>
          <li>
            <strong>Old URLs</strong> from the previous Squarespace site
            (<Code>/home/p/&lt;slug&gt;</Code>) redirect permanently to works still for sale. The
            rest answer 410 Gone, so search engines drop them, rather than landing somewhere
            misleading; one that matches a work that is only hidden stays a 404, since it may
            come back.
          </li>
        </ul>
      </Section>

      {/* ── 8 · Guards ─────────────────────────────────────────────── */}
      <Section n={8} id="guards" title="Tests & build guards">
        <TestingLayers unit={UNIT_TESTS} e2e={E2E_TESTS} />
        <p>
          {UNIT_TESTS} unit and component tests (Vitest and Testing Library) and {E2E_TESTS}{" "}
          Playwright tests (one of them opt-in), every one listed by name in the{" "}
          <Link href="/architecture/tests" className="text-brand underline underline-offset-2 hover:no-underline">
            test inventory
          </Link>
          , which the production build writes itself. Beyond ordinary behaviour tests, a set of
          guards turn whole classes of mistake into build failures. Most exist because the
          mistake happened once.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-700 border-b border-gray-300">
                <th scope="col" className="py-2 pr-4 font-semibold">Guard</th>
                <th scope="col" className="py-2 font-semibold">Fails the build when…</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 align-top">
              <GuardRow name="Brand colour">
                a brand-green hex literal appears under <Code>app/</Code>, <Code>components/</Code>{" "}
                or <Code>lib/</Code> instead of the <Code>@theme</Code> token. There were 186, in
                four different hover greens.
              </GuardRow>
              <GuardRow name="Site identity">
                the brand, domain, email, phone, Instagram handle or analytics id is typed into
                code instead of read from <Code>data/siteConfig.ts</Code>.
              </GuardRow>
              <GuardRow name="Admin form fields">
                a server action reads a checkbox its form never renders, or tests one against{" "}
                <Code>&quot;off&quot;</Code>. A browser never sends &quot;off&quot;; both mistakes
                once shipped at the same time.
              </GuardRow>
              <GuardRow name="Collector photo privacy">
                the home-photo path stops re-encoding, or starts stamping the artist&rsquo;s
                copyright on someone else&rsquo;s photograph.
              </GuardRow>
              <GuardRow name="Placeholder metadata">
                image metadata reappears in the blur placeholders shipped in the bundle.
              </GuardRow>
              <GuardRow name="Accessibility">
                axe finds a WCAG 2.1 A/AA violation on any public page, the open mobile menu or
                the order form (every rule, colour contrast and colour-only links included).
              </GuardRow>
              <GuardRow name="Visual regression">
                the gallery, a painting, the photographs, the gift shop or the about page, on a
                desktop or a phone, looks different from its reference screenshot by more than 1%
                of its pixels (e2e/visual.spec.ts). The references are rendered on CI&rsquo;s own
                runner by a workflow run on the branch, since a laptop&rsquo;s fonts differ.
              </GuardRow>
              <GuardRow name="Performance budget">
                the gallery, a painting, the photographs, the gift shop or the about page, loaded
                by Lighthouse as a simulated phone (median of five runs), passes its limit for
                the performance score, when the main image appears, layout shift, main-thread
                blocking or JavaScript size (lighthouserc.json). The limits sit a margin past
                today&rsquo;s numbers, so they catch a real slowdown, not noise.
              </GuardRow>
              <GuardRow name="Keyboard">
                the first Tab doesn&rsquo;t reach a working skip link, the phone menu doesn&rsquo;t
                say whether it is open or close on Escape, or the image viewer stops being a
                dialog that takes focus, keeps it and gives it back (e2e/keyboard.spec.ts). A
                person checks the rest with VoiceOver twice a year (RUNBOOK.md).
              </GuardRow>
              <GuardRow name="Content-Security-Policy">
                any public page, the signed-in admin or a playing film raises a policy violation
                (<Code>e2e/csp.spec.ts</Code>), or a page is served without a fresh nonce.
              </GuardRow>
              <GuardRow name="Security headers">
                any response is missing the frame, sniffing, referrer or permissions header.
              </GuardRow>
              <GuardRow name="Dependency audit">
                a production dependency has a high or critical security advisory (
                <Code>audit-ci</Code>, the first step in CI), other than the Prisma CLI exception
                named in <Code>audit-ci.jsonc</Code>.
              </GuardRow>
              <GuardRow name="Lint">
                ESLint reports an error. It wasn&rsquo;t in CI until two dependency upgrades that
                broke it outright passed every other check.
              </GuardRow>
              <GuardRow name="Post-deploy smoke test">
                after a production deploy, the deployed commit isn&rsquo;t the one live on the
                domain, or a key page fails to render with its headers; a GitHub issue is opened.
              </GuardRow>
              <GuardRow name="Secret scan">
                Gitleaks finds a credential anywhere in the git history, not only the latest
                commit, since a secret deleted later is still in it.
              </GuardRow>
              <GuardRow name="Code scan">
                Semgrep finds an issue under its TypeScript, React, Next.js, OWASP Top 10 or
                secrets rules, in the source, the workflows or the Dependabot config.
              </GuardRow>
              <GuardRow name="Server actions">
                an exported server action runs for a caller with no session, or reaches the
                database before checking for one.
              </GuardRow>
              <GuardRow name="Security scan">
                OWASP ZAP&rsquo;s baseline scan of the CI build raises a finding not triaged in{" "}
                <Code>.zap/rules.tsv</Code>, where each accepted one carries its reason.
              </GuardRow>
              <GuardRow name="E2E database">
                <Code>DATABASE_URL</Code> is not local; the suite refuses to start.
              </GuardRow>
              <GuardRow name="E2E image requests">
                a spec takes <Code>test</Code> from <Code>@playwright/test</Code> instead of{" "}
                <Code>e2e/test.ts</Code>, whose fixture keeps each optimized-image request running
                after its page has left. Without it, one spec leaving the admin mid-load hung{" "}
                <Code>next start</Code>&rsquo;s image optimizer and failed a later, unrelated spec
                for weeks.
              </GuardRow>
              <GuardRow name="Archive before delete">
                a destructive script&rsquo;s archive would overwrite an earlier one; the write fails
                and nothing is deleted.
              </GuardRow>
            </tbody>
          </table>
        </div>
        <h3 id="property-testing" className="font-semibold text-gray-800">Tests that pick their own inputs</h3>
        <p>
          An ordinary test checks the examples someone thought of. A property-based test
          (<strong>fast-check</strong>, <Code>__tests__/properties.test.ts</Code>) states a rule
          that must hold for every input, such as &ldquo;a title always becomes a slug the admin
          accepts&rdquo; or &ldquo;an order&rsquo;s price always comes from the catalogue, never
          from the request&rdquo;, then tries hundreds of generated inputs: empty, very long,
          Unicode, malformed. When one breaks the rule, it is shrunk to the smallest input that
          still does. They cover the code that turns outside input into something the site acts
          on: URL slugs, image shapes and prices, the public forms&rsquo; limits, Buy Now orders
          and browser error reports.
        </p>
        <p>
          The first runs found two bugs the examples had missed. A title longer than 60
          characters, cut just after a word, became an id ending in a hyphen (a second work with
          the same title got a double one), a form the site&rsquo;s own slug rule refuses; the
          hyphen is now trimmed after the cut. And the &ldquo;from&rdquo; price of a size type
          named <Code>valueOf</Code> or <Code>__proto__</Code> threw instead of being 0, because
          the lookup reached JavaScript&rsquo;s built-in object properties (the admin form&rsquo;s
          list of size types kept it from happening in practice). An ordinary test now pins each
          case. Random inputs
          don&rsquo;t suit mutation testing, which needs the same score every time it runs, so
          under Stryker the properties use a fixed seed. Fixed, they caught no planted bug the
          examples missed: the edges they reach only now and then (a slug of exactly 80
          characters, a form field of exactly its limit) are now ordinary tests, with the exact
          wording of each refusal. That took URL slugs from 84% to 100% and form input from 80%
          to 95.5%, and both floors went up with them.
        </p>
        <h3 id="mutation-testing" className="font-semibold text-gray-800">Testing the tests: mutation testing</h3>
        <p>
          A passing test proves only that the code does what the test checks. Mutation testing
          checks the checking: <strong>Stryker</strong>{" "}(<Code>stryker.config.mjs</Code>) plants
          one small bug at a time (a <Code>&lt;</Code> becomes <Code>&lt;=</Code>, a line is
          deleted, <Code>true</Code> becomes <Code>false</Code>) and reruns the unit tests. A
          mutant the tests notice is <em>killed</em>; one they don&rsquo;t <em>survives</em>, and
          marks behaviour nothing pins. It covers only the modules where an unnoticed bug costs
          money, data or security: order pricing, availability, form input, rate limits, the
          database guard, the private media store, backups, Instagram publishing, the URL rules
          and the admin sign-in (passkeys and the session cookie), 1,108 mutants in all.
        </p>
        <MutationScores />
        <p>
          A full run reruns the tests once per mutant, about 50 minutes, so a pull request gets a
          scoped one (<Code>.github/workflows/mutation.yml</Code>): only the modules it changes, or
          whose tests it changes, are mutated, and each mutant meets only the tests that import
          that module (<Code>vitest related</Code>, so no list of test files goes stale). Most pull
          requests touch none and finish in a minute; one module takes a few. Each module has a
          floor just under its score, and a pull request that leaves a module it touched below
          its floor fails, which is how new logic arrives with tests that pin it and how a
          weakened test gets noticed. Floors only go up. Every module runs weekly as well, for
          what a pull request can&rsquo;t show: a change to code a module merely imports. No run
          reuses an earlier one&rsquo;s results: Stryker&rsquo;s cache can&rsquo;t see a test
          change here, and would go on crediting a test that had been deleted.
        </p>
        <p>
          The first full run (October 2026, about 50 minutes) killed 630 of the 902: 69.8%. By
          module, from strongest: availability 95%, the private media store 92%, URL slugs and
          rate limits 84%, form input 80%, the database guard 75%, order pricing 74%, the retired
          URL rules 74%, backups 58%, Instagram publishing 53% and the media route 53%. Most
          survivors in order pricing had one cause. The tests checked that a bad order was
          refused, never why, so deleting a check passed whenever a later check refused the same
          order for a different reason. The duplicate-image rule for gift packs was one: delete
          it and a repeated image was still refused, but as &ldquo;unavailable&rdquo;. The reason
          is what the buyer reads, so the tests now pin each refusal to its own, and order
          pricing scores 99% (one survivor, which changes nothing a buyer could see). That took
          the whole to 74.4%.
        </p>
        <p>
          The media route was next, at 53%, and its gap was the one that mattered most. The
          test&rsquo;s fake database returned a work whatever it was asked, so deleting{" "}
          <Code>visible: true</Code>{" "}from the route&rsquo;s query, which would have served a
          hidden work&rsquo;s image to anyone, passed every test. The fake now answers the query
          against a small catalogue, and the route scores 94%. Adding the admin sign-in showed
          it was barely unit-tested at all: the passkey ceremonies scored 2% and the session
          cookie 0%, because only the end-to-end suite exercised them and every unit test faked
          the session. Their refusals are pinned now (a stale or reused challenge, an unknown
          passkey, a failed verification, the cookie&rsquo;s flags), at 95% and 100%. When a
          weekly run finds a module below its floor, it opens an issue, since nobody is watching
          a scheduled run.
        </p>
        <p>
          The last two were the weakest. Backups scored 58%: the restore test gave rows only to
          the catalogue and the retired URLs, so restoring a snapshot could have silently skipped
          the films, the Instagram queue and the excluded browsers. Every table is restored and
          checked now, and backups score 100%. Instagram publishing scored 53%, with the same
          blind spot as the media route: its fake database accepted any write without looking at
          which post or what changed. Deleting the production-only guard, the claim that stops a
          post going out twice, or the requeue after a failure all passed, as did sending a reel
          through the image path and emailing from the wrong caller. A new test records every
          write in full, runs the retry waits on a fake clock and checks who each alert reaches
          and what it says; publishing scores 99%. The three survivors left are two log lines and
          a wait of zero.
        </p>
        <p>
          The first attempt scored about 5%. That was the tooling, not the tests: Stryker&rsquo;s
          Vitest runner doesn&rsquo;t switch mutants on under Vitest 5, so every test ran against
          the original code and passed. Switching a mutant on by hand showed the tests did catch
          it. Stryker now runs Vitest as a plain command, one run per mutant: slower, but honest.
          A score that looks too bad to be true deserves the same suspicion as one that looks too
          good.
        </p>
      </Section>

      {/* ── 9 · Security ───────────────────────────────────────────── */}
      <Section n={9} id="security" title="Security & privacy">
        <DefenceLayers />
        <p>
          <strong>What this defends against:</strong> the public forms being used as a mail relay,
          someone taking over the admin, a collector&rsquo;s home location leaking through a
          photograph&rsquo;s metadata, a poisoned dependency or workflow action, and a script
          injected into the page. <strong>What it doesn&rsquo;t:</strong> a compromised Vercel,
          GitHub or Neon account, which hold everything (the Vercel one also holds the passkey
          break-glass); and volumetric DDoS beyond what Vercel absorbs.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Admin authentication is a passkey</strong> (WebAuthn, <Code>lib/passkey.ts</Code>):
            Touch ID, Face ID or a security key, verified with <Code>@simplewebauthn/server</Code>{" "}
            against a one-time challenge held in the encrypted session cookie, with user
            verification required. It can&rsquo;t be phished, since it is bound to this domain, and
            the server holds only public keys. Once one passkey is registered the password stops
            working; the break-glass for losing every device is <Code>ADMIN_PASSWORD_LOGIN=1</Code>{" "}
            in Vercel, which needs the owner&rsquo;s Vercel account. A successful sign-in becomes an
            iron-session cookie: encrypted, httpOnly, SameSite=Lax, Secure in production, eight
            hours. Every server action that changes data checks that session before doing anything.
          </li>
          <li>
            <strong>Login attempts</strong> are limited to five failures per fifteen minutes per
            client IP, counted in Postgres so the limit holds across every serverless instance
            (until September 2026 it was a Map in one instance&rsquo;s memory). The key is an HMAC
            of the address. It fails open: the admin locked out of a broken site is the one who
            has to fix it.
          </li>
          <li>
            <strong>Errors don&rsquo;t hide.</strong> A visitor who hits a failing page sees a
            branded &ldquo;try again&rdquo; rather than a stack trace, and the owner is emailed,
            once a day per kind of error, counted in between. Errors in the browser are reported
            too, but only from this site&rsquo;s own scripts, at most five per page, ten per
            address in ten minutes, and ten emails a day in all.
          </li>
          <li>
            <strong>The analytics endpoint is rate-limited</strong> per address, like the forms,
            so a script can&rsquo;t write unbounded rows or skew the dashboard; the limiter fails
            open so an outage never loses a real visitor&rsquo;s event.
          </li>
          <li>
            <strong>Cron routes</strong> require the <Code>CRON_SECRET</Code> bearer token and
            return 401 without it.
          </li>
          <li>
            <strong>Public forms</strong> validate names and emails server-side, and all three
            carry a honeypot. The booking form also rejects a submission made faster than a
            person could type it, and the contact form one with no spaces in it. The site stores
            no payment details because it takes no payments.
          </li>
          <li>
            <strong>The forms can&rsquo;t be used as a mail relay.</strong>{" "}Each one emails a
            confirmation to the address typed in, from the site&rsquo;s own domain, so each is
            rate-limited in Postgres across every serverless instance: per client IP and form,
            per recipient address, and a daily total (<Code>lib/form-rate-limit.ts</Code>). The
            confirmations repeat nothing the visitor typed (not even their name), and the stored
            keys are HMACs, never raw IP or email addresses. Over the IP limit, nothing is sent; over
            the others, the artist still gets the enquiry and only the confirmation is held back.
          </li>
          <li>
            <strong>Analytics</strong> stores no IP address: location is the coarse
            country and city Vercel supplies, and visitors are counted by a random httpOnly cookie.
            Headless browsers and bots are dropped at ingest.
          </li>
          <li>
            <strong>Other people&rsquo;s photographs</strong> are re-encoded to remove location
            metadata, credited as their owners asked, and removable from the edit form.
          </li>
          <li>
            <strong>Secrets</strong> live in Vercel environment variables. The repository carries
            only <Code>.env.local.example</Code>, with placeholder values.
          </li>
        </ul>
      </Section>

      {/* ── 10 · Security testing & resilience ───────────────────────── */}
      <Section n={10} id="security-testing" title="Security testing & resilience">
        <CoverageGrid />
        <p>
          What is in place, and what is not, stated plainly, including the things that
          haven&rsquo;t been done.
        </p>
        <h3 className="font-semibold text-gray-800">Automated security tests</h3>
        <p>These run in CI on every pull request:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Admin login rejects a wrong password, and locks out after five failed attempts
            (<Code>e2e/admin.spec.ts</Code>, <Code>e2e/zz-rate-limit.spec.ts</Code>).
          </li>
          <li>Admin pages redirect to the login page without a session.</li>
          <li>
            The order endpoint refuses a size the work isn&rsquo;t sold in and a work that
            doesn&rsquo;t exist; every form sends nothing once over its limit; and no confirmation
            repeats a submitted name or title (<Code>__tests__/form-email-abuse.test.ts</Code>).
          </li>
          <li>
            The order and contact endpoints reject requests with missing fields, accept honeypot
            submissions without sending anything, and the contact endpoint rejects a message with
            no spaces (<Code>e2e/api-validation.spec.ts</Code>). A caught bot gets the same reply
            as a person and is counted as spam, never as a message, and a refused email is an
            error, not a success (<Code>__tests__/form-email-abuse.test.ts</Code>).
          </li>
          <li>
            Collectors&rsquo; photos are re-encoded, never published with their location data, and
            never stamped with the artist&rsquo;s copyright (unit tests).
          </li>
          <li>The E2E suite refuses to run against a database that isn&rsquo;t local.</li>
          <li>
            Every form posts, so one sent before JavaScript loads keeps the visitor&rsquo;s email
            and message out of the URL, and out of analytics (<Code>e2e/forms.spec.ts</Code>).
          </li>
          <li>
            Every server action, called for real with no session, is sent to sign in before it
            touches the database; only the sign-in flows are exempt, and a new action is checked
            automatically (<Code>__tests__/server-actions-auth.test.ts</Code>).
          </li>
          <li>
            Script put into the search box, a category or a URL is shown as text, never run, on
            the server&rsquo;s HTML and in the browser (<Code>e2e/abuse.spec.ts</Code>).
          </li>
          <li>
            The public forms refuse a body over 32&nbsp;KB, a field over its length limit and a
            field that isn&rsquo;t text, and send nothing (<Code>lib/form-input.ts</Code>, tested
            by handler and on the running server).
          </li>
          <li>
            Passkey sign-in refuses a stale, missing or reused challenge, a passkey this admin
            never registered, an answer that fails verification and any host but this
            site&rsquo;s, and counts each failure toward the lockout; registering or removing a
            passkey needs a session; the session cookie is http-only, same-site, secure in
            production and lasts eight hours (<Code>__tests__/passkey-actions.test.ts</Code>,{" "}
            <Code>__tests__/session.test.ts</Code>).
          </li>
          <li>
            <Code>/media</Code>{" "}serves an upload only while a visible work uses it: a hidden
            work&rsquo;s image and collector photo, and a file no work uses, are 404s that never
            read the store (<Code>__tests__/media-route.test.ts</Code>).
          </li>
          <li>
            Instagram publishing refuses on any deployment but production, claims a post before
            anything irreversible so it can&rsquo;t go out twice, and returns a failed post to the
            queue only when nothing went live (<Code>__tests__/instagram-publish-flow.test.ts</Code>).
          </li>
          <li>
            Mutation testing (§8) checks that these tests would notice: on a pull request that
            touches the sign-in, the media route, Instagram publishing, backups or the other
            guarded modules, it plants bugs in them and fails if too many go unnoticed.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-800">Automated scanning (DAST)</h3>
        <p>
          On every push to <Code>main</Code>, after the E2E suite passes, CI starts the same
          production build again and runs the{" "}
          <strong>OWASP ZAP baseline scan</strong>{" "}against it: a spider crawls the site (over
          a thousand URLs) and ZAP&rsquo;s passive rules check every response: headers,
          cookies, the policy, caching, information leaks. It sends no attack payloads and never
          touches production. The ZAP image is pinned, so a new release can&rsquo;t fail an
          unrelated change. Pull requests skip it to save Actions minutes, since passive findings
          come from headers and markup that rarely change. Any finding fails the job unless{" "}
          <Code>.zap/rules.tsv</Code>{" "}records it as triaged, with the reason; the report is
          attached to the run.
        </p>
        <p>
          Its first run found four things, and all four were fixed rather than accepted. The
          contact form, sent before JavaScript loaded, put the visitor&rsquo;s email and message
          in the URL; every form now posts. Responses announced <Code>X-Powered-By: Next.js</Code>.
          And the cross-origin opener and resource policies were missing. What it still reports
          is accepted on the record: GA4&rsquo;s script
          can&rsquo;t carry a subresource-integrity hash because Google changes it, and{" "}
          <Code>Cross-Origin-Embedder-Policy</Code>{" "}would block the map and analytics for an
          isolation the site doesn&rsquo;t need. The public forms carry no anti-CSRF token
          because they act for no one (there is no session for a forged request to ride),
          while the admin&rsquo;s server actions reject a request from another origin, behind a
          SameSite cookie.
        </p>
        <h3 className="font-semibold text-gray-800">Active scanning</h3>
        <p>
          Once a week (<Code>.github/workflows/zap-full.yml</Code>), CI builds the site against a
          throwaway database and attacks it. ZAP&rsquo;s <strong>full scan</strong>{" "}crawls the
          pages and sends attack payloads to every one it finds: SQL injection, cross-site
          scripting, path traversal, header and command injection. Its{" "}
          <strong>API scan</strong>{" "}does the same to the JSON endpoints behind the forms, which
          a crawler can&rsquo;t discover because JavaScript calls them; they are described for it
          in <Code>.zap/public-api.yaml</Code>. The rate limits are emptied every few seconds for
          the scan, or the scanner, being one address, would only ever meet a 429. Nothing is
          emailed and production is never touched. Findings fail the run and open an issue, and
          are triaged in the same <Code>.zap/rules.tsv</Code>. One is accepted for the admin
          alone: signed out, its pages redirect to sign in with a body of about 15&nbsp;KB, which
          ZAP flags as a redirect that might carry the page it protects. It carries only the
          public header and footer, which Next sends before the redirect, and an E2E test fails
          if a product title or analytics figure ever appears in it.
        </p>
        <p>
          That is the automated half of a penetration test. The targeted half is the abuse tests
          above, which pin the particular ways this site takes input; writing them found that the
          public forms had no size limits at all. What neither does is think like an attacker
          about this site&rsquo;s logic. An attacker-style review of the code did that in
          October 2026 (<Code>docs/security-review-2026-10.md</Code>): nothing critical or high
          in the code, sixteen medium and low findings fixed, among them an admin cookie that
          stayed valid for two weeks after logout, a race that could publish an Instagram
          post twice, and no daily limit on the emails the forms send. It also found the
          private file store for backups and unpublished images had never been connected. A
          manual test by a person is still the next step. <Code>/.well-known/security.txt</Code>
          {" "}tells anyone who finds a problem where to report it.
        </p>
        <h3 className="font-semibold text-gray-800">Static analysis</h3>
        <p>
          TypeScript runs in strict mode with <Code>noUncheckedIndexedAccess</Code>: reading
          an item from a list or a lookup table is typed as possibly missing, because it can
          be, so the code has to say what happens then. Switching it on (October 2026) raised
          147 errors. Most were tests reading back what they had just built, but three were
          real: a backup script given <Code>--file</Code> without a path crashed with an
          unhelpful error, a size guess returned nothing when a work offered no sizes, and
          a hashtag pick returned nothing for a category with an empty list of sets.
        </p>
        <p>
          Beside TypeScript and ESLint, a second workflow (
          <Code>.github/workflows/static-analysis.yml</Code>) runs on every pull request, in
          parallel with the E2E suite. <strong>Gitleaks</strong>{" "}scans every commit in the
          history for credentials, with its output redacted; <strong>Semgrep</strong>{" "}scans
          the source against its TypeScript, React, Next.js, OWASP Top 10 and secrets rules.
          Either fails the run on any finding. CodeQL and GitHub&rsquo;s own secret scanning
          would need GitHub Advanced Security on a private repository; these are free and need
          no account.
        </p>
        <p>
          Their first run found nothing in the application code or anywhere in the git history.
          What Semgrep did find was in the supply chain, and both were fixed: the workflows
          referenced actions by version tag, which can be moved to point at other code, so every
          action is now pinned to a commit hash; and Dependabot now waits seven days before
          offering a new release, the usual window in which a hijacked package is caught and
          pulled. One folder is excluded: a design handoff kept for reference, which the site
          never serves or imports.
        </p>
        <h3 className="font-semibold text-gray-800">Dependencies</h3>
        <p>
          Dependabot opens grouped update PRs weekly for npm packages and monthly for GitHub
          Actions, after a seven-day cooldown, and GitHub raises security alerts with automatic
          fix PRs, which skip the cooldown; each one runs the
          full CI like any other change. Installs are reproducible (
          <Code>package-lock.json</Code> is committed and CI uses <Code>npm ci</Code>), and CI runs{" "}
          <Code>audit-ci</Code> on production dependencies, failing on any high or critical
          advisory.
        </p>
        <p>
          Major upgrades are held when the toolchain isn&rsquo;t ready, with the reason in{" "}
          <Code>dependabot.yml</Code>: TypeScript 7 and ESLint 10 both broke linting on arrival,
          and <Code>@types/node</Code>{" "}follows the Node version the site runs on (22), not the
          newest one.
        </p>
        <p>
          One exception is allowlisted by name in <Code>audit-ci.jsonc</Code>: the Prisma
          CLI&rsquo;s own dependencies (deepmerge-ts, mysql2), which no 7.x release fixes and
          which run only during the build, never when a visitor loads a page. Each entry is
          pinned to its path under <Code>prisma</Code>, so the same advisory arriving through
          anything else still fails. Until October 2026 the whole audit was held at critical
          to make room for it.
        </p>
        <h3 className="font-semibold text-gray-800">Not done yet</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-700 border-b border-gray-300">
                <th scope="col" className="py-2 pr-4 font-semibold">Area</th>
                <th scope="col" className="py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 align-top">
              <GuardRow name="Manual penetration test">
                None by a third party. An active scan runs weekly and abuse tests run on every
                pull request (above); a person probing this site&rsquo;s own logic has not.
              </GuardRow>
              <GuardRow name="Load testing to failure">
                The load test is capped at 50 visitors on purpose, and the site was comfortable
                there, so where it stops coping is still unmeasured.
              </GuardRow>
            </tbody>
          </table>
        </div>
        <h3 className="font-semibold text-gray-800">External uptime monitoring</h3>
        <p>
          The health check runs on Vercel, so it can&rsquo;t see Vercel itself, the domain or the
          certificate fail. Better Stack (free plan) watches from outside, every three minutes,
          and emails on failure: one monitor on the home page, and one on{" "}
          <Code>/api/health</Code>, which answers 200 only when the database does. The second one
          exists because the free plan checks only that a URL responds, and during a database
          outage the site still responds, with its error page; the keyword check that would
          catch that is a paid feature. <Code>/api/health</Code>{" "}says nothing but{" "}
          <Code>{"{\"ok\":true}"}</Code>, caches a healthy answer at the edge for 30 seconds so
          it can&rsquo;t be used to hammer the database, and never caches a failure. Certificate
          and domain-expiry warnings are paid too; an expired certificate still fails the check.
        </p>
        <h3 className="font-semibold text-gray-800">DDoS and traffic spikes</h3>
        <p>
          Vercel applies automatic DDoS mitigation and system-level traffic filtering to every
          request before it reaches the application, and Attack Mode can be switched on for the
          project during an attack. It challenges browsers while letting known good bots
          through. The repository defines no firewall rules of its own. Because pages render per
          request against a serverless database over HTTP, a spike turns into more function
          invocations and queries rather than exhausted connections.
        </p>
        <h3 className="font-semibold text-gray-800">Load testing</h3>
        <p>
          <Code>load/visitors.js</Code>{" "}is a k6 script that simulates visitors: each one loads
          the gallery, a painting, a photograph or the photo gallery, then the gift shop, map or
          films, pausing one to three seconds between pages the way a person does. It reads the
          works from the sitemap, so it follows the live catalogue. It makes read-only GET
          requests for pages alone (no forms, no admin, nothing written), and k6 runs no
          JavaScript, so analytics never sees it. It stops itself if more than 1% of requests
          fail or the 95th percentile passes three seconds, and it has no default target, so
          nobody runs it against production by accident.
        </p>
        <p>
          Against production on 28 September 2026 it ramped to <strong>50 simultaneous
          visitors</strong>{" "}over three and a half minutes, about 24 page renders a second at
          the peak, every one a function invocation with its Neon queries:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-700 border-b border-gray-300">
                <th scope="col" className="py-2 pr-4 font-semibold">Measure</th>
                <th scope="col" className="py-2 font-semibold">Result</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 align-top">
              <GuardRow name="Pages served">2,849, none failed</GuardRow>
              <GuardRow name="Median">135 ms</GuardRow>
              <GuardRow name="95th percentile">194 ms (slowest page type: the films, 251 ms)</GuardRow>
              <GuardRow name="99th percentile">275 ms</GuardRow>
              <GuardRow name="Slowest request">852 ms</GuardRow>
            </tbody>
          </table>
        </div>
        <p>
          The one slow request (852&nbsp;ms) was not Neon waking up: at 24 renders a second the
          database never idled. It fits a new function instance starting during the ramp. Neon
          cold starts are real for the first visitor after five idle minutes, which is what the
          catalogue cache now absorbs. Response times stayed flat as the load rose, which says
          the ceiling is well above 50.
          How far above was not tested: the run is capped deliberately, because it runs against
          the live site.
        </p>
        <h3 className="font-semibold text-gray-800">HTTP security headers</h3>
        <p>
          Every response (pages, API routes, the admin) carries{" "}
          <Code>X-Frame-Options: DENY</Code> (no other site may frame the pages),{" "}
          <Code>X-Content-Type-Options: nosniff</Code>,{" "}
          <Code>Referrer-Policy: strict-origin-when-cross-origin</Code>, and a{" "}
          <Code>Permissions-Policy</Code> that switches off the camera, microphone, geolocation,
          payment and other features the site never uses, and{" "}
          <Code>Cross-Origin-Opener-Policy</Code>{" "}and{" "}
          <Code>Cross-Origin-Resource-Policy</Code>{" "}set to <Code>same-origin</Code>, so no
          other site gets a handle on its windows or can embed its images. Nothing announces the
          framework. They are set once, in{" "}
          <Code>lib/security-headers.ts</Code>, and checked by a unit test and by an E2E test that
          reads real responses. <Code>Strict-Transport-Security</Code>{" "}comes from Vercel, with a
          two-year max-age.
        </p>
        <h3 className="font-semibold text-gray-800">Content-Security-Policy</h3>
        <p>
          Nonce-based and strict. <Code>proxy.ts</Code>{" "}gives every page request a fresh nonce;
          a script runs only if it carries it, or was loaded by one that did (
          <Code>&apos;strict-dynamic&apos;</Code>); no <Code>&apos;unsafe-inline&apos;</Code>{" "}
          for scripts and no host allowlist. Next.js stamps the nonce on its own scripts, and the
          GA4 tags take it from the layout. Nonces need every page rendered per request, which
          this site already does, so they cost nothing extra here. Each outside service is named
          once: analytics, the newsletter, the map tiles and iframe, stored images and films.
        </p>
        <p>
          Two deliberate allowances. Styles allow inline, because React renders{" "}
          <Code>style</Code>{" "}attributes that nonces can&rsquo;t cover. And the admin alone may
          use <Code>blob:</Code>{" "}workers and <Code>eval</Code>, for the converter that turns
          iPhone photos into JPEGs; the public site gets neither.
        </p>
        <p>
          It is <strong>enforcing</strong>, since 28 September 2026. It was sent as report-only
          first, so a wrong guess couldn&rsquo;t break the site; a day of real traffic reported
          only two things, the Vercel toolbar&rsquo;s comments frame (the owner&rsquo;s own
          browser, now allowed) and GA4&rsquo;s per-country audience ping (stopped at the source
          by consent mode). Violations are still reported to <Code>/api/csp-report</Code> and
          aggregated into <Code>CspViolation</Code>{" "}(directive, blocked origin, page, count),
          so that table is where to look when something on a page stops working. API
          responses, which need no nonce and skip the proxy, carry a fixed policy that allows
          nothing at all (<Code>default-src &apos;none&apos;</Code>). An E2E test
          loads every page, the signed-in admin and a playing film and fails on any violation,
          which turns a new third-party host into a CI failure rather than a broken page.
        </p>
      </Section>

      {/* ── 11 · Build & runtime notes ──────────────────────────────── */}
      <Section n={11} id="build-notes" title="Build & runtime notes">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>The proxy skips files by extension, not by folder.</strong> It once excluded
            the <Code>photographs</Code>{" "}image folder by name, which also matched the{" "}
            <Code>/photographs</Code>{" "}pages, so they shipped without a policy, and the CSP
            test passed, because a page with no policy raises no violations. That test now also
            requires the policy on every page it loads.
          </li>
          <li>
            <strong>No interactive transactions.</strong> The Neon HTTP adapter runs single
            statements, so anything that must be atomic is written as one: the counters are
            single upserts, the analytics prune is one <Code>deleteMany</Code>, and reordering
            the catalogue is one <Code>UPDATE … FROM (VALUES …)</Code>. It was a loop of single
            updates, and a failure halfway left an order nobody chose. Neon&rsquo;s WebSocket
            driver does offer transactions on serverless; nothing has needed one yet.
          </li>
          <li>
            <strong>Node is pinned</strong> (<Code>engines.node</Code>, <Code>.nvmrc</Code>) so CI
            and Vercel build on the same major; they weren&rsquo;t guaranteed to before.
          </li>
          <li>
            <strong>Connection URL</strong> lives in <Code>prisma.config.ts</Code> (Prisma 7), which
            loads <Code>.env.local</Code> over <Code>.env</Code> the way Next.js does, and never
            overrides a variable already set, so an exported local <Code>DATABASE_URL</Code>{" "}
            always wins.
          </li>
          <li>
            <strong>Server-action body limit</strong>{" "}is raised to 4.5&nbsp;MB, matching
            Vercel&rsquo;s function request limit; images are downscaled in the browser to fit.
          </li>
          <li>
            <strong>Identity and theme are data.</strong> Whose site this is lives in{" "}
            <Code>data/siteConfig.ts</Code> and the brand colours in Tailwind <Code>@theme</Code>{" "}
            tokens, which is what makes the repository a template: a second artist forks it and
            follows <Code>FORKING.md</Code>.
          </li>
          <li>
            <strong>CI&rsquo;s image optimizer is not production&rsquo;s.</strong>{" "}
            <Code>next start</Code>, which CI serves, hangs for good on an optimized-image request
            whose browser has already disconnected, and every later request for that image queues
            behind it. Six of them take all of Chrome&rsquo;s connections to the host. For weeks
            this looked like a database stall in the admin tests, while Postgres had no
            connections at all. The E2E suite now fetches those images on the page&rsquo;s behalf,
            so they always finish. On Vercel, <Code>/_next/image</Code>{" "}is served by
            Vercel&rsquo;s own optimizer.
          </li>
          <li>
            <strong>Locally,</strong> the database is a Neon dev branch or a local Postgres, not
            production. <Code>lib/db-guard.ts</Code> refuses any remote host not named in{" "}
            <Code>DATABASE_ALLOW_HOST</Code>, so a stale <Code>.env</Code> fails loudly rather
            than writing to the live catalogue.
          </li>
        </ul>
      </Section>

      {/* ── 12 · Durability ─────────────────────────────────────────── */}
      <Section n={12} id="durability" title="Backups & durability">
        <RecoveryLayers />
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>A snapshot every six hours, in a private store.</strong> A cron writes a JSON
            snapshot of <Code>Product</Code>, the films&rsquo; rows, the Instagram queue, the
            excluded browsers and the retired URL slugs (<Code>lib/backup.ts</Code>) to a{" "}
            <em>private</em> Blob store, which can&rsquo;t be read without its token, keeps a
            week, and emails the owner if a write fails. Six hours because that is exactly
            Neon&rsquo;s point-in-time window on the Free plan: past it, a snapshot is the only
            way back, and a daily one could lose most of a day. The snapshots hold hidden works,
            collectors&rsquo; credits and the source photos&rsquo; coordinates; until September
            2026 they sat in the public store at a guessable name, then at an unguessable one.{" "}
            <Code>npm run db:export</Code> takes one by hand.
          </li>
          <li>
            <strong>Restores are drilled, not assumed.</strong>{" "}
            <Code>scripts/backup-drill.ts</Code> restores a snapshot into an empty throwaway
            database and fails unless every table reads back identical, row for row. CI runs it
            on every pull request against the seeded database, so a change that breaks restoring
            can&rsquo;t ship; against the newest production snapshot, into a Neon branch, it is a
            monthly task in <Code>RUNBOOK.md</Code>. The 44-work catalogue restores in under a
            second. A unit test restores every table from its own rows and checks each one (
            <Code>__tests__/backup-format.test.ts</Code>); until October 2026 it gave rows to only
            two, so a restore that skipped the other three would have passed. The restore code is
            mutation-tested at 100% (§8).
          </li>
          <li>
            <strong>The artwork has more than one copy.</strong> The catalogue&rsquo;s images
            are on Blob and in git history; films are uploaded from their local source files by{" "}
            <Code>scripts/publish-films.ts</Code>.
          </li>
          <li>
            <strong>Destructive scripts archive first and default to a dry run.</strong> The Blob
            pruner checks every product, film and Instagram post, and every Blob URL written in
            the repository, for references before deleting, and archives each file it removes. It
            covers every folder the admin writes to and names any folder it doesn&rsquo;t, since
            nine unused files once built up unseen in two folders it skipped; the analytics purge writes the rows it will delete to a file named to the
            second, and refuses to overwrite an earlier one.
          </li>
          <li>
            <strong>Not in the snapshots:</strong> the films themselves, which are re-uploaded
            from their source files, and analytics, which is a record rather than an asset.
            Neon&rsquo;s point-in-time restore covers the whole database, analytics included, for{" "}
            <strong>six hours</strong> (Free plan, capped at 1&nbsp;GB of history; seven days on
            Launch, thirty on Scale). Snapshots and media are still all with one provider,
            Vercel, in two stores.
          </li>
          <li>
            <strong>Secrets have a copy off Vercel.</strong> Every credential lives in
            Vercel&rsquo;s environment variables, so losing that account would mean going back to
            each provider. <Code>npm run secrets:backup</Code>{" "}pulls Production&rsquo;s
            variables and encrypts them with <Code>age</Code>{" "}under a passphrase kept apart from
            the file. The plaintext exists only in a private temporary folder, and the script
            refuses to write inside the repository. <Code>RUNBOOK.md</Code>{" "}is the one-page
            handover: every account, where each secret comes from, and what to do when something
            breaks.
          </li>
        </ul>
      </Section>

      {/* ── 13 · Decisions ─────────────────────────────────────────── */}
      <Section n={13} id="decisions" title="Decisions & trade-offs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-700 border-b border-gray-300">
                <th scope="col" className="py-2 pr-4 font-semibold">Decision</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Why</th>
                <th scope="col" className="py-2 font-semibold">Cost</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 align-top">
              <DecisionRow
                decision="Render per request, read the catalogue from a tagged cache"
                why="Fresh CSP nonce on every page; Neon is woken by changes, not by visitors"
                cost="Every admin write must expire the tag; script edits wait for the hour or Refresh site; each deploy starts empty"
              />
              <DecisionRow
                decision="Neon over HTTP"
                why="Serverless-friendly: no pool to exhaust, no connection storms"
                cost="Single statements only; no interactive transactions"
              />
              <DecisionRow
                decision="prisma db push, no migrations"
                why="Schema ships with the code in the same build"
                cost="Additive changes only; destructive ones need a manual plan"
              />
              <DecisionRow
                decision="Catalogue images on Blob only"
                why="One home for every image, whether seeded or uploaded through the admin"
                cost="The deploy refuses to build while any row still names an old repo path"
              />
              <DecisionRow
                decision="Previews opt-in, each on its own Neon branch"
                why="A shareable URL behind Vercel Authentication, never on production data"
                cost="Three settings to turn on; a preview without its branch refuses to build"
              />
              <DecisionRow
                decision="First-party analytics beside GA4"
                why="Owns the data; excludes the owner at ingest"
                cost="Another table to prune and a dashboard to maintain"
              />
              <DecisionRow
                decision="Orders by email, not checkout"
                why="No payment data, no PCI scope, a personal sale"
                cost="Every order is handled by hand"
              />
              <DecisionRow
                decision="Functions and database in US-East"
                why="Vercel's default region sits beside Neon's; one round trip is the whole page"
                cost="A Georgian Bay visitor is served from Virginia, ~20 ms further than Toronto"
              />
              <DecisionRow
                decision="A nonce on every page"
                why="Strict CSP with no inline-script allowance"
                cost="Even the prose pages render per request; nothing is prerendered, by choice"
              />
              <DecisionRow
                decision="Errors go to email, not a vendor"
                why="One owner, one inbox; the same channel as the health check"
                cost="No stack-trace browser, no release tracking, one email a day per error"
              />
              <DecisionRow
                decision="Passkeys instead of the admin password"
                why="Phishing-proof, and Touch ID or Face ID makes it two factors in one step"
                cost="Losing every device means the Vercel break-glass; register a second device"
              />
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── 14 · Repository map ────────────────────────────────────── */}
      <Section n={14} id="repo-map" title="Repository map">
        {/* Focusable: on a phone it scrolls sideways, and a keyboard has to be able to scroll it. */}
        <pre
          tabIndex={0}
          aria-label="Repository map"
          className="text-xs sm:text-sm leading-relaxed bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-x-auto text-gray-800"
        >
{`app/
  page.tsx · HomeClient.tsx        gallery (server page + client filter/sort)
  products/[id]  photographs/[id]  a work: sizes, order form, JSON-LD, room view
  locations/  making-of/           map of where works were made · films
  gift-shop/                       calendar, card and postcard pack builders
  about/  faq/  contact/  book/    static and form pages
  for-artists/  architecture/      the pitch · this page (+ /tests, the inventory)
  admin/                           Content Management System, Instagram queue,
                                   analytics dashboard, security (passkeys)
  actions/                         server actions: admin, passkey, instagram, analytics
  api/                             buy · contact · book · track · og-image ·
                                   csp-report · client-error · version ·
                                   health · cron/*
  home/p/[slug]/                   legacy Squarespace URLs: redirect, or 410 Gone
  media/[...path]/                 private uploads, only for a visible work or the admin
  sitemap.ts · robots.ts           generated from siteConfig
proxy.ts                           per-request CSP nonce for every page
instrumentation.ts                 uncaught server errors → lib/error-report.ts
app/error.tsx · global-error.tsx   what a visitor sees when a page throws
components/                        Navigation, ProductCard, GalleryGrid,
                                   BuyNowButton, MakingOfVideo, LocationMap, …
lib/
  db.ts                            Prisma singleton; adapter by URL
  db-guard.ts                      off Vercel, only a local or named database
  private-blob.ts                  the private store: uploads as /media paths
  backup.ts                        the snapshot: build, fingerprint, restore
  catalogue-images.ts              catalogue on Blob: paths, mockups, absolute URLs
  product-path.ts · product-lookup.ts  a work's URL (slug); old slugs redirect
  csp.ts · csp-report.ts           the policy · parsing violation reports
  error-report.ts                  count errors, keep a stack; email first, then daily
  client-error.ts                  check a browser's error report before it is recorded
  passkey.ts                       the admin's passkeys: relying party, password rule
  session.ts · rate-limit.ts       admin session · login limiter
  order.ts                         what an order is: server-side titles and prices
  form-rate-limit.ts               Postgres-backed limits for the public forms
  form-input.ts                    size and type limits on what the forms accept
  analytics.ts                     UA parsing, bot and host filters
  engagement-rank.ts               gallery order from visitor engagement
  instagram.ts                     caption drafting, price ranges, scheduling
  instagram-publish.ts             two-step Graph API publish, reconciled by container
  blob-cleanup.ts                  reference counting before delete
  home-photo.ts                    re-encode collectors' photos (strips GPS)
  image-copyright.ts               stamp the artist's notice on uploads
  availability.ts · json-ld.ts     sold-out rules · structured data
data/                              siteConfig, price table, seed catalogue, blurs
prisma/                            schema.prisma · seed.ts
RUNBOOK.md                         one-page handover: accounts, secrets, incidents
scripts/                           films, mockups, blurs, copyright, backups, backup-drill.ts,
                                   secrets-backup.sh,
                                   assert-catalogue-on-blob.ts,
                                   Blob pruner, analytics purge, smoke.mjs,
                                   test-inventory.mjs
__tests__/                         Vitest unit, component and source-scan tests
e2e/                               Playwright specs, shared fixture (test.ts), axe scans, db-guard
.github/workflows/e2e.yml          audit-ci, lint, build, E2E on every PR; + ZAP scan on main
audit-ci.jsonc                     the audit's one named exception (Prisma CLI)
.github/workflows/static-analysis.yml  Gitleaks (history) + Semgrep (source), every PR
data/test-inventory.json           every test by name, written by the build
.github/workflows/smoke.yml        post-deploy check of production, opens an issue on failure
.github/workflows/zap-full.yml     weekly active scan (pages + JSON endpoints)
.github/workflows/mutation.yml     mutation test (Stryker): modules a PR touches; all, weekly
stryker.config.mjs                 the mutated modules and each one's score floor
.zap/rules.tsv                     ZAP findings triaged as accepted, with reasons
.zap/public-api.yaml               the JSON endpoints, described for the API scan
.semgrepignore                     what Semgrep skips, and why
load/visitors.js                   k6 load test: simulated visitors, read-only
.github/dependabot.yml             weekly npm and monthly Actions updates
vercel.json                        branch deploy rules · crons`}
        </pre>
      </Section>
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────────── */

function Section({
  n,
  id,
  title,
  children,
}: {
  n: number;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  // Collapsed until opened. The heading is the toggle; deep links and Expand
  // all open it too (SectionToggles.tsx). The content is in the
  // HTML either way, so search engines and find-in-page still see it.
  return (
    <details id={id} data-section className="group scroll-mt-24">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1.5 [&::-webkit-details-marker]:hidden">
        <h2 id={`${id}-h`} className="text-lg font-semibold text-gray-800">
          {n} · {title}
        </h2>
        <svg
          aria-hidden="true"
          className="w-5 h-5 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      <div className="space-y-3 text-gray-700 leading-relaxed pt-1 pb-6">{children}</div>
    </details>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[0.85em] bg-gray-100 text-gray-800 rounded px-1 py-0.5">
      {children}
    </code>
  );
}

function Chip({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-600">{term}</dt>
      <dd className="text-sm text-gray-800 mt-0.5">{value}</dd>
    </div>
  );
}

function OpsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-brand mb-1">{title}</h3>
      <p className="text-sm text-gray-700 leading-relaxed">{children}</p>
    </div>
  );
}

function Diagram({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure
      aria-label={label}
      className="rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-6 not-prose"
    >
      {children}
    </figure>
  );
}

function Tier({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-md border bg-white px-4 py-3 ${accent ? "border-brand/40" : "border-gray-300"}`}
    >
      <p className={`text-sm font-semibold ${accent ? "text-brand" : "text-gray-800"}`}>{title}</p>
      <p className="text-sm text-gray-600 mt-1 leading-relaxed">{children}</p>
    </div>
  );
}

function Side({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="rounded-md border border-gray-300 bg-white px-3 py-2">
      <p className="text-sm font-medium text-gray-800">{title}</p>
      <p className="text-xs text-gray-600">{sub}</p>
    </div>
  );
}

function Stage({ title, sub, accent }: { title: string; sub: string; accent?: boolean }) {
  return (
    <div
      className={`flex-1 rounded-md border bg-white px-3 py-2 ${accent ? "border-brand/40" : "border-gray-300"}`}
    >
      <p className={`text-sm font-semibold ${accent ? "text-brand" : "text-gray-800"}`}>{title}</p>
      <p className="text-xs text-gray-600 mt-0.5 leading-snug">{sub}</p>
    </div>
  );
}

function Down() {
  return (
    <p aria-hidden="true" className="text-center text-gray-500 leading-none py-1.5">
      ↓
    </p>
  );
}

function Right() {
  return (
    <>
      <span aria-hidden="true" className="hidden sm:flex items-center text-gray-500 px-0.5">
        →
      </span>
      <span aria-hidden="true" className="sm:hidden text-center text-gray-500 leading-none">
        ↓
      </span>
    </>
  );
}

function Entity({
  name,
  note,
  children,
}: {
  name: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="font-mono text-sm font-semibold text-brand">{name}</h3>
      <p className="text-xs text-gray-600 mb-3">{note}</p>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr] gap-3 text-sm">
      <dt className="font-mono text-gray-800 break-words">{k}</dt>
      <dd className="text-gray-600">{v}</dd>
    </div>
  );
}

function Flow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-brand/40 pl-4">
      <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function GuardRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <tr className="border-b border-gray-200">
      <th scope="row" className="py-2 pr-4 font-semibold text-gray-800 text-left whitespace-nowrap">
        {name}
      </th>
      <td className="py-2">{children}</td>
    </tr>
  );
}

function DecisionRow({ decision, why, cost }: { decision: string; why: string; cost: string }) {
  return (
    <tr className="border-b border-gray-200">
      <th scope="row" className="py-2 pr-4 font-semibold text-gray-800 text-left">
        {decision}
      </th>
      <td className="py-2 pr-4">{why}</td>
      <td className="py-2">{cost}</td>
    </tr>
  );
}

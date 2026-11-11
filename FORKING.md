# Running this site for another artist

This codebase is meant to be forked: one repo, one database and one Vercel
project per artist, so each one owns their site outright and a fix here can be
merged down to all of them. It is not multi-tenant, and deliberately so — "you
own the code and the data" is hard to honour when the data lives in a shared
table on somebody else's account.

Work through this in order. It takes an afternoon, most of which is waiting for
DNS.

---

## 1. Before anything else: the plan has to be Pro

**Vercel's Hobby plan cannot host this site.** From Vercel's
[fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines):

> **Hobby teams** are restricted to non-commercial personal use only. All
> commercial usage of the platform requires either a Pro or Enterprise plan.

Commercial usage is "any Deployment used for the purpose of financial gain of
**anyone** involved in **any part of the production** of the project", and the
examples given catch an artist's storefront twice over: *requesting or
processing payment from visitors*, *advertising the sale of a product*, and
*receiving payment to create, update, or host the site*.

So: selling prints makes it commercial, and being paid to build it makes it
commercial independently. Budget **$20/month per developer seat**. Projects on
a Pro team are unlimited, so hosting several artists on one team costs the same
as hosting one — but that makes you their hosting provider, their billing
intermediary and their uptime problem. Decide which you are offering before the
first client, not after.

Neon is not a constraint: the [free plan](https://neon.com/docs/introduction/plans)
allows 100 projects at 0.5 GB each, which is far more than a catalogue needs.

---

## 2. Infrastructure

| | |
|---|---|
| **Vercel** | New project on a **Pro** team, connected to the fork |
| **Neon** | New project. Use the **pooled** connection string (host ends `-pooler…neon.tech`) |
| **Vercel Blob** | New store in the project → `BLOB_READ_WRITE_TOKEN` |
| **Resend** | API key, and verify the sending domain |
| **Domain** | Add in Vercel; decide apex vs `www` and keep it consistent with `siteConfig.url` |

## 3. Environment variables

`.env.local.example` is the canonical list with setup notes — copy it to
`.env.local` and work through it. In short:

**Required for the site to run at all**

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon, pooled |
| `ADMIN_PASSWORD` | The only credential for `/admin` |
| `SESSION_SECRET` | 32+ chars — `openssl rand -hex 32` |
| `BLOB_READ_WRITE_TOKEN` | Image and film uploads |

**Required for anything to reach an inbox**

| Variable | Notes |
|---|---|
| `RESEND_API_KEY` | Buy Now, contact form, and every failure notification |
| `CRON_SECRET` | Guards all three cron routes; without it they are open |

**Only if the artist wants automated Instagram posting**

| Variable | Notes |
|---|---|
| `IG_ACCESS_TOKEN` | A Facebook **Page** token. Confirm `debug_token` reports `expires_at: 0` before saving — a token with a real expiry looks fine and dies days later |
| `IG_BUSINESS_ACCOUNT_ID` | |
| `ANTHROPIC_API_KEY` | Drafts the captions. Production scope only, by convention |

Optional overrides: `ANTHROPIC_MODEL`, `IG_REEL_POLL_BUDGET_MS` (keep the
latter under the `maxDuration` of both Instagram segments — there is a test
that enforces it).

If the artist does not want Instagram, remove its entry from `vercel.json`'s
`crons` rather than leaving a job that emails a failure three times a week.

---

## 4. Make it theirs

### `data/siteConfig.ts` — the one file

Brand, artist, short name, locality, tagline, URL, both email addresses, phone,
Instagram handle, GA4 id, sale banner, free-shipping threshold, and the
testimonial and press mention.

Two names, and they are not interchangeable: `brand` is the storefront, and
`artist` is the person whose name goes on the copyright. Set both.

Set `testimonial` and `press` to **`null`** to start. A new artist has no
collectors and no coverage, and null removes those sections entirely rather
than leaving an empty heading. Fill them in when they are true.

Set `analytics.ga4` to `""` until there is a property; the script is skipped
entirely when it is empty.

`__tests__/site-config.test.ts` fails the build if any of these values gets
hard-coded back into a component, so you will hear about a miss.

### The brand colour

`@theme` in `app/globals.css`:

```css
@theme {
  --color-brand: #2c5f2e;
  --color-brand-hover: #245026;   /* the solid button's hover */
  --color-brand-tint: #f0f7f0;    /* selected rows, highlight panels */
}
```

Change those three and the whole site re-colours. Mirror the same values in
`lib/brand.ts`, which the SVG charts and map markers read — a test fails if
the two disagree.

### Delete what is not theirs

**This is the step that matters legally.** The repo ships James's actual work:

| | |
|---|---|
| `catalogue/` in his Blob store | the paintings, photographs and room mockups, named by `data/products.ts` and `data/photographs.ts` through `siteConfig.blobStore` |
| `public/james.jpg` | the About portrait |
| `data/products.ts`, `data/photographs.ts` | the catalogue |
| `data/making-of.ts` | film URLs, pointing at his Blob store |
| `data/blurs.ts` | generated placeholders for the above |

Empty the data arrays, set `blobStore` in `data/siteConfig.ts` to your own store, and delete the portrait. Then set
`SEED_CATALOGUE_OWNER` in `data/products.ts` to the new artist's name — it must
match `siteConfig.artist`, and **`npm run db:seed` refuses to run when they
disagree**, because seeding one artist's paintings into another's storefront
is silent and is a copyright problem rather than an untidy one. `--force`
exists for developing against someone else's data on purpose.

Simplest path for a new artist: empty the arrays, skip the seed entirely, and
add works through `/admin`, which uploads to Blob and generates its own blur
placeholders.

### Delete the pages that are the pitch, not the shop

`app/for-artists/`, `app/architecture/` and `app/book/` (plus `app/api/book/`,
`lib/booking.ts` and their tests) are James's sales pitch for building these
sites. They are not part of an artist's storefront. Delete them, remove the
"For Artists" and "Architecture" entries from `components/Navigation.tsx`, and
remove their three entries from `app/sitemap.ts` so the sitemap doesn't list
pages that 404.

### Rewrite the bespoke copy

`app/about/page.tsx` is a biography — rewrite it wholesale rather than trying
to parameterise it. It names the publication in prose on purpose, which is why
the identity test does not police that file.

Then read `app/faq/page.tsx` and `data/giftShop.ts` / `data/merchandise.ts`,
which describe how *this* artist sells: e-transfer, Canada Post, local pickup
in the Blue Mountain area, CanvasChamp sizes and prices.

---

## 5. Check before launch

```bash
npm run build     # prisma generate + db push + tests + next build
npm run test:e2e  # needs a dev server; see CLAUDE.md
```

Then, on the deployed site:

- `/sitemap.xml` and `/robots.txt` name the new domain (both derive from `siteConfig.url`)
- A product page's JSON-LD has the right `brand` and an absolute image URL
- **Send one real Buy Now and one contact-form submission.** A missing
  `RESEND_API_KEY` fails exactly here, silently, and the visitor sees an error.
  Nothing else catches it.
- The footer's copyright names the artist, not the brand
- `/admin` logs in, an upload works, and the uploaded image carries the new
  copyright metadata

---

## 6. Staying current

Keep this repo as an upstream remote so fixes flow down:

```bash
git remote add upstream https://github.com/JamesPortman/georgian-bay-artists.git
git fetch upstream
git merge upstream/main
```

This works for as long as each fork's changes stay in config and content. Once
a fork starts editing shared components, merges get expensive — which is the
argument for pushing anything genuinely reusable back up here instead.

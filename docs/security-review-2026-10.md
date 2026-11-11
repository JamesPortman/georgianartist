# Security review, October 2026

An attacker-style review of the site's own logic: the part that automated
scanning (ZAP, Semgrep, Gitleaks) and the abuse tests can't judge. Done on
8 October 2026 by reading the code, not by attacking production. Three
reviewers worked in parallel, one per area, and traced each finding end to
end in the code; every finding fixed here was confirmed again while fixing
it, and the configuration gap (1) against the project's environment
variables.

**Scope**

| Area | What was read |
|---|---|
| Admin and sign-in | every server action and admin page; the session cookie; the password and passkey sign-in; the login lockout; uploads |
| Public surface | every `app/api` route; the three forms; `/media`; the image optimizer; legacy redirects; analytics, CSP and browser-error intake |
| Jobs, integrations, supply chain | the four cron routes; Instagram publishing; backups and destructive scripts; secrets handling; every GitHub workflow; `next.config.ts` |

**Result.** No critical or high finding in the code. Every server action and
admin page checks the session; the session can't be forged; there is no
CSRF, open redirect, SQL injection, SSRF, path into the private store, or way
to change a price. The serious finding was a **configuration gap**: the
private Blob store the code was built for had never been connected (1), since fixed. The
code findings are medium and low, and all but two are fixed in this change.

## Needs the owner

**1. The private Blob store was not connected (high, configuration). Fixed; see below.**
`PRIVATE_BLOB_READ_WRITE_TOKEN` is set in no Vercel environment, so
`lib/private-blob.ts` falls back to the public store, as it was written to do
until the store existed. Since then:
- the nightly catalogue backups (hidden works, collectors' credits, source
  photos' coordinates) are written to the public store, protected only by a
  random suffix in the URL;
- images of works not yet published are public before the work is;
- collectors' photos of their homes stay reachable by URL after the work is
  hidden or the photo removed.

Fix: create a second Blob store, connect it to the project with the prefix
`PRIVATE_BLOB`, redeploy, then move existing backups, unpublished uploads
and home photos into it and delete the public copies.

**Fixed.** The store (`georgian-bay-artists-private`) was connected with the
prefix `PRIVATE_BLOB` on 22 October 2026 and production redeployed; backups
and new uploads have gone to it since. On 11 November
`scripts/move-to-private-store.ts --apply` moved what the public store still
held: three collectors' home photos, each archived locally, copied, repointed
to `/media/homes/…` and its public copy deleted. No unpublished work had an
image in the public store, and the older public backups had already aged out
under the 7-day retention, which prunes both stores.

**2. Outside checks.** The review's environment couldn't reach them, so they
were run by hand on 11 November 2026:

| Check | Result |
|---|---|
| Mozilla HTTP Observatory, `www.georgianartist.com` | **A+**, 130/100, 12/12 tests passed |
| SSL Labs, `www.georgianartist.com` | **A**: TLS 1.3, post-quantum key exchange, CAA record; RSA 2048 certificate |
| SPF, `georgianartist.com` | `v=spf1 include:mailgun.org ~all` (Squarespace forwarding), valid |
| SPF, `send.georgianartist.com` | `v=spf1 include:amazonses.com ~all` (Resend's bounce domain), valid |
| DKIM, selector `resend` | published |
| DMARC, `_dmarc.georgianartist.com` | published, **`p=none`**, reports to Mailgun and OnDMARC |

The Observatory's suggestions are declined on purpose: `style-src
'unsafe-inline'` is needed for React's `style` attributes (`lib/csp.ts`; scripts
use a nonce); HSTS preload and `includeSubDomains` are a decision for the whole
domain (`lib/security-headers.ts`); Cross-Origin-Embedder-Policy would block the
map and analytics. Subresource Integrity doesn't apply: every script is the
site's own.

**DMARC stays at `p=none` (accepted, 11 November 2026).** Mail that fails
SPF and DKIM while claiming to be from `@georgianartist.com` is still
delivered, so the address could be spoofed. Accepted because:
- the website (Resend) is the only sender, and its mail passes DMARC even
  when forwarded: a test message showed SPF, DKIM and DMARC pass, with DKIM
  aligned on `georgianartist.com` (selector `resend`);
- the `_dmarc` record belongs to Squarespace's Email Forwarding preset, which
  Squarespace locks; removing the preset to rewrite it by hand could stop
  `info@` forwarding;
- the site sends little mail, and reports already go to Mailgun and OnDMARC.

To revisit: ask Squarespace Support to set `p=quarantine` on the preset, or
change it if the preset becomes editable. Check first with
`dig +short TXT _dmarc.georgianartist.com`.

DNS itself is one zone: the registry lists both `squarespacedns.com` and
`p03.nsone.net` nameservers, and every one of them returns the same SOA
(Squarespace's DNS runs on NS1) and the same records.

**3. GitHub secret `BLOB_READ_WRITE_TOKEN`.** No workflow uses it any more
(see 6). Done: the repository has no Actions secrets (checked 11 November 2026). Rotating the
token is optional: it was readable only by code running in this
repository's own CI.

## Fixed in this change

| # | Severity | Finding | Fix |
|---|---|---|---|
| 4 | Medium | **A copied admin cookie worked for 14 days.** The cookie's `maxAge` was 8 hours, but iron-session's server-side `ttl` defaulted to 14 days, so a copied cookie outlived logout. | `ttl` is 8 hours (`lib/session.ts`); a test with the real iron-session pins it. |
| 5 | Medium | **One Instagram post could be published twice.** The claim updated by id alone, so two overlapping runs (a cron delivered twice, "Post now" during the cron) could both claim and publish. Approving could also re-queue a post already live. | The claim matches only an `approved` post (`updateMany`), and a lost claim publishes nothing; approving refuses a `posted` or `posting` post. |
| 6 | Medium | **The production Blob token was in every PR's CI.** `e2e.yml` exposed it to `npm ci`, the build and the tests, though nothing used it. | Removed; the workflow is `contents: read`. |
| 7 | Medium | **No daily limit on emails to the owner.** Only per IP, per form: about 2,000 a day from one address, enough to bury the inbox and spend the email quota so real enquiries fail. | 150 a day across all forms (`allowOwnerEmail`), one alert when reached; over it, the visitor gets the phone and email fallbacks. |
| 8 | Medium (latent) | **Cron routes let anyone in if `CRON_SECRET` was unset.** It is set in production, so not open today. | `lib/cron-auth.ts`: fails closed, constant-time comparison. |
| 9 | Low | Any `*.georgianartist.com` subdomain was accepted for passkeys, so a taken-over subdomain could relay a sign-in. | Only the site and `www.`. |
| 10 | Low | Work titles went into the locations map's popups as HTML (scripts were already blocked by the CSP). | Escaped (`lib/escape-html.ts`). |
| 11 | Low | The image optimizer served any Vercel customer's Blob images, and a leftover `placehold.co`. | The site's own store only, by name. |
| 12 | Low | Each IPv6 address had its own rate limit, though one client holds a /64. | Limits key IPv6 by /64 (`lib/client-ip.ts`). |
| 13 | Low | `+tag` and Gmail-dot variants of one address each got 3 confirmations a day. | Counted as one inbox (`mailbox`). |
| 14 | Low | A vetoed browser-error alert stayed marked as sent, muting that error for a day. | The claim is released when vetoed. |
| 15 | Low | Line breaks in a name or error path reached email subjects. | Subjects are one line (`lib/email-subject.ts`). |
| 16 | Low | Honeypot hits and malformed visitor cookies wrote analytics rows without limit. | Honeypot hits count against the per-IP limit; the cookie must look like an id. |
| 17 | Low | The password comparison wasn't constant-time, and an empty `ADMIN_PASSWORD` would accept an empty field. | `lib/admin-password.ts`: hashed, constant-time, never empty. |
| 18 | Low | Uploads were stored with whatever type the request claimed (an SVG could be stored as one). | JPEG, PNG, WebP or AVIF only; anything else is stored as JPEG. Editing a work now checks its size type and price as creating one does. |
| 19 | Low | The visual-baselines workflow ran branch code with a push token in `.git/config`. | The token is given only to the commit step. |

## Accepted, with reasons

- **Password-login lockout can be raced or spread across addresses.** It only
  applies while password login is allowed, which is never once a passkey is
  registered unless the break-glass `ADMIN_PASSWORD_LOGIN=1` is on. Keep that
  off. Use a long `ADMIN_PASSWORD` (16+ characters).
- **Sessions can't be revoked server side** before their 8 hours are up;
  rotating `SESSION_SECRET` signs everyone out. Acceptable with one admin and
  an 8-hour session.
- **The CSP-report and browser-error tables can be filled** with distinct
  junk, within per-IP limits. Rows are small and the owner is never emailed
  more than the daily cap. Revisit if the tables grow.
- **`/home/p/<slug>` answers 404 for a hidden work and 410 for none**, which
  can confirm a guessed slug of an unpublished work. Low value; left.
- **The MX lookup on a submitted address has no timeout.** Slows only that
  request.

## Checked and sound

Every server action and admin page checks the session before doing
anything (`requireAuth`, enforced by `__tests__/server-actions-auth.test.ts`).
The session cookie is sealed and authenticated, HttpOnly, SameSite=Lax,
Secure in production. Next's server actions check Origin; no admin API takes
a cookie. Passkey challenges are single-use, time-limited and verified
against stored keys only. No redirect takes a target from the request.
`/media` serves only four upload folders, by a strict pattern, and only for a
visible work or the admin. Orders take ids and choices only; titles, sizes
and prices come from the database. Emails are plain text, built from
database values; visitor input never reaches a third party. Raw SQL is
always parameterised. JSON-LD is escaped. Captions sent to Instagram come
only from the owner's catalogue or the admin's topic, and every post needs
approval; hidden works are held back. Backups exclude passkeys and logs, and
the restore drill refuses a non-empty or production database. No secret is
tracked in git, and no `NEXT_PUBLIC_` variable holds one. Workflows pin
actions to SHAs, use no `pull_request_target`, and pass event values to
scripts through `env:` only.

## Not covered

What only the dashboards show: GitHub branch protection and default Actions
token permissions, and Vercel's deployment protection. The outside checks
in (2) were run by hand afterwards. A manual test by a person, which this review stands in for but
doesn't replace.

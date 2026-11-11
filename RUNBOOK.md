# Handover runbook: georgianartist.com

One page for whoever takes the site over. The site is a Next.js app on
Vercel, with Neon Postgres for data. Deploying means merging a pull request into
`main`. There is no server to log in to. `CLAUDE.md` has the detail and
`/architecture` the design; this page covers who holds what, and what to do
when something breaks.

## Accounts

Every account below is held by the owner (james@portman.ca). Handing the site
over means transferring or sharing each one.

| Service | What it does | If it's lost |
|---|---|---|
| **GitHub** `JamesPortman/georgian-bay-artists` | Code, CI, Dependabot | The code is gone; any clone is a full copy |
| **Vercel** | Hosting, env vars, crons, Blob store | Site down; secrets only in the encrypted copy |
| **Neon** (Free plan) | Postgres: catalogue, orders, analytics | Point-in-time restore covers **6 hours** only; after that, the 6-hourly snapshot in the private Blob store |
| **Vercel Blob** (inside Vercel), two stores | Public: catalogue images (`catalogue/`), films. Private: backups, admin uploads, collectors' photos | Catalogue images are also in git history and `public/` until removed; films re-upload from source; later uploads lost |
| **Squarespace Domains** | Domain, DNS, `info@` forwarding (MX → Mailgun) | Site and email unreachable; renewal is the risk |
| **Resend** | Every email the site sends (forms, alerts) | Forms "work" but nobody is told |
| **Meta** (Facebook Page + Instagram business) | Auto-posting | Posting stops; an alert email says so |
| **Anthropic** | Drafts Instagram captions | Captions can't be generated |
| **Google Analytics** (`G-KKZVBB0PWX`) | Visitor analytics | Only GA history; first-party analytics continue |
| **Better Stack** (free) | Uptime monitor from outside Vercel | No outside alert when Vercel or the domain fails |
| **Kit** | Newsletter sign-ups (public form id, no secret) | Sign-ups fail |

## Secrets

All secrets live in Vercel's **Production** environment variables, and
nowhere else except the encrypted copy:

```
npm run secrets:backup                         # needs: vercel CLI (linked), brew install age
npm run secrets:backup -- --verify <file.env.age>   # list what's inside
age -d <file.env.age> > .env.restore           # decrypt (never commit it)
```

Keep the `.env.age` file off Vercel and out of the repo: a USB stick, iCloud
Drive, the password manager. Keep the **passphrase separately**: in the
password manager, plus a sealed copy for whoever inherits the site. Rerun the
backup after rotating any secret. Variables Vercel marks "Sensitive" come back
empty; the script names them, so you can copy them in by hand.

| Variable | From |
|---|---|
| `DATABASE_URL` | Neon → project → Connection details (pooled) |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → the public Blob store (also a GitHub Actions secret) |
| `PRIVATE_BLOB_READ_WRITE_TOKEN` | Vercel → Storage → the **private** Blob store (prefix `PRIVATE_BLOB`): backups, unpublished uploads, collectors' photos |
| `RESEND_API_KEY` | Resend → API keys |
| `SESSION_SECRET` | Random, ≥ 32 chars (`openssl rand -hex 32`); rotating it signs the admin out |
| `ADMIN_PASSWORD` | Only used before a passkey exists, or under the break-glass |
| `CRON_SECRET` | Random; Vercel sends it to the cron routes |
| `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID` | Meta: a **Page** token; `debug_token` must say `expires_at: 0` |
| `ANTHROPIC_API_KEY` | Anthropic console |

## When something breaks

- **An alert email arrives.** Subjects starting ⚠️ come from `lib/notify.ts`.
  Health alerts come from `/api/cron/health` every hour, and say ✅ on
  recovery. Error alerts come from `ErrorReport`: the first time an error
  happens, then at most daily. The email says what failed.
- **A bad deploy.** Go to Vercel → Deployments, pick the last good deployment
  and choose **Instant Rollback**. Then revert the PR on GitHub. A failed build
  never goes live: the previous deployment keeps serving.
- **Lost or broken data.** Within 6 hours: Neon's point-in-time restore, into a
  branch first, then compare. After that: the newest good snapshot
  (`backups/catalog-*.json` in the **private** Blob store, every 6 hours,
  a week kept). Rehearse it with `DRILL_DATABASE_URL=<empty Neon branch>
  DATABASE_ALLOW_HOST=<its host> npm run backup:drill`; restoring for real is
  the same steps against the database you'll promote.
- **Locked out of `/admin`** (every passkey device lost). Set
  `ADMIN_PASSWORD_LOGIN=1` in Vercel, redeploy, and sign in with
  `ADMIN_PASSWORD`. Register a new passkey at `/admin/security`, then remove
  the variable.
- **Instagram posting stopped.** The token is probably invalid. Renew the
  Page token, confirm it never expires, update `IG_ACCESS_TOKEN`, and redeploy.
- **A secret leaked.** Rotate it at the provider, update Vercel, redeploy,
  then rerun `npm run secrets:backup`. Deleting it from git is not enough.

## Running it day to day

- **Change something.** Branch → PR → CI green (build, unit and E2E tests,
  Gitleaks, Semgrep) → merge. Vercel deploys, and the smoke test confirms it
  went live, or opens a GitHub issue if it didn't.
- **Locally.** Point `.env.local` at a Neon **dev branch** with
  `DATABASE_ALLOW_HOST` set to its host. The app refuses any other remote
  database. To run a script against production, name production's host for
  that one command.
- **Preview deployments** are off until all three are set: the Neon
  integration's preview branching (Vercel → Storage → Neon), `PRODUCTION_DATABASE_HOST`
  (all environments; production's Neon host), and `ENABLE_PREVIEWS=1` (Preview).
  A preview without its own Neon branch refuses to build. Previews are behind
  Vercel Authentication, and can't publish to Instagram.
- **Crons** (`vercel.json`; times are UTC, so Eastern is 4 h earlier in
  summer and 5 in winter): backup every 6 h (00, 06, 12, 18), analytics prune 05:30, Instagram
  15:00 Mon/Wed/Fri, health every 10 min.
- **Monthly: restore drill.** Make an empty Neon branch, then
  `DRILL_DATABASE_URL=<branch url> DATABASE_ALLOW_HOST=<branch host> npm run backup:drill`.
  It restores the newest production snapshot and fails unless every table
  matches. Delete the branch afterwards.
- **Twice a year, and after any redesign: the screen-reader check.** CI checks
  the markup (axe) and the keyboard (`e2e/keyboard.spec.ts`); only a person can
  tell whether it makes sense out loud. About 20 minutes on a Mac, in Safari:
  1. Turn on VoiceOver (Cmd-F5). Open the home page.
  2. **Tab once:** "Skip to content, link" is spoken and shown. Press Return:
     the next Tab lands on the gallery's search box.
  3. **Headings (VO-Cmd-H):** "Welcome to …" (level 1), then "Paintings"
     (level 2), then each painting's title (level 3). Nothing skips a level.
  4. **Rotor (VO-U):** Landmarks lists banner, navigation, main and footer;
     Links reads sensibly out of context (no "click here").
  5. **A painting:** "Enlarge image of …, button". Press Return: "…, enlarged,
     dialog" is spoken and focus is on Close. Tab stays inside; Escape closes
     and puts you back on the Enlarge button.
  6. **Order form:** every field's label is read as you reach it. Send it empty:
     the problem is announced without having to find it.
  7. **On an iPhone (Settings → Accessibility → VoiceOver):** the Menu button
     says "collapsed" / "expanded"; swiping right reaches every menu link.
  8. **Zoom to 200% (Cmd-+) on a laptop:** nothing overlaps or needs sideways
     scrolling.
  Anything that sounds wrong is a bug: note the page and what was said.
- **Renewals to diary.** The domain at Squarespace, plus any paid plans on
  Vercel, Neon and GitHub Actions (Actions has a US$20/month spending limit).

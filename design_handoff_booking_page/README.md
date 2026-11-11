# Handoff: GeorgianArtist.com booking page (georgianartist.com/book)

> **Update — 20 Sep 2026, after the build.** The page shipped on
> **https://www.georgianartist.com/book**, not portman.ca: James asked for it on
> the GeorgianArtist domain, which already had the framework, the mail provider
> and the test suite. `qr-georgianartist.png` has been **regenerated** to encode
> that URL (`qr-georgianartist.svg` is the same code as vector, for the printer).
> The rest of this document is the original spec and still describes the design
> faithfully; where it says the page must live at portman.ca, read
> georgianartist.com. The four open questions at the bottom are answered:
> (1) it is a Next.js route on georgianartist.com, `POST /api/book`;
> (2) Resend, already in use for the site's other notifications;
> (3) yes — the submitter gets an autoresponder, alongside the confirmation panel;
> (4) `/book` is final, and the QR now matches it.

## Overview
A single public page where an artist or artisan requests a free 15-minute intro
chat with James Portman about building them a website. It is the scan destination
for the QR code printed on both sides of the GeorgianArtist.com promotional flier,
so it must live at **https://portman.ca/book** (exact path — the printed QR encodes it).

Goal of the page: convert a market/gallery handout into an emailed lead. Every
submission must reach **james@portman.ca** reliably.

## About the design files
The files in this bundle are **design references created in HTML** — prototypes
showing intended look and behavior, not production code to copy directly. The task
is to **recreate this design in the target codebase's existing environment**
(React, Vue, Astro, plain PHP, whatever portman.ca runs) using its established
patterns and libraries. If portman.ca has no framework yet, pick the simplest thing
that can serve one page and accept a form POST.

`Booking Page.dc.html` will not run standalone outside this design tool — it depends
on a custom runtime (`support.js`). Read it as a specification, not as a deliverable.
`_ds/` holds the design system stylesheet it composes against; `styles.css` there is
real, portable CSS and **can** be used directly if convenient.

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy and component classes are final.
Recreate the UI faithfully. All values below are exact.

## ⚠ The one thing that must change: form submission
The prototype submits via `mailto:` — it opens the *visitor's* mail client with the
answers pre-filled. This was a no-server placeholder and is **not acceptable in
production**: it fails silently on any device without a configured mail app (common
on a phone at a farmer's market), and the lead is lost.

**Required implementation:** POST the form server-side and email james@portman.ca.
Any of these is fine, in order of preference:
1. A server route on portman.ca (`POST /book`) that validates and sends mail via
   the existing transactional mail provider.
2. A serverless function (Cloudflare Worker / Netlify or Vercel function) + a mail
   API (Resend, Postmark, SES).
3. A hosted form service (Formspree, Basin) if no backend exists.

Requirements for whichever route is chosen:
- Server-side validation of `name` and `email` (both required).
- Spam protection that does not use a visible CAPTCHA: a honeypot field plus a
  time-to-submit check, or Cloudflare Turnstile. (The design system's own site copy
  promises "spam-proof forms" — don't ship a naked endpoint.)
- On success: render the confirmation panel already designed (see *States* below) —
  ideally without a full page navigation.
- On failure: show an error that still gives the visitor the fallbacks (text
  416-410-8899, email james@portman.ca). Never dead-end.
- Send the submitter's email address in the mail's `Reply-To` so James can reply
  directly from his inbox.
- Optional but useful: an autoresponder to the submitter confirming receipt.

### Email format expected by James
Subject: `Booking request — <name>`
Body, one field per line, in this order:

```
Name: <name>
Email: <email>
Phone: <phone>
What they make: <medium>
Town: <town>
Where they are now: <current>

Notes:
<notes>
```

## Page structure (single column, max-width 980px, centered)
Vertical stack, gap `clamp(22px, 3vw, 34px)`. Page padding `clamp(20px, 5vw, 56px)`.
Page min-height 100vh. Ground color #fdf8e3 on both `body` and the page wrapper.

### 1. Masthead
Flex row, `align-items: flex-end`, `justify-content: space-between`, wraps, gap 16px.
Bottom border 1px solid #1d1f20, padding-bottom 12px.
- **Left:** `GeorgianArtist` in #1d1f20 + `.com` in #6f7375. Barlow Condensed 600,
  `clamp(22px, 3vw, 30px)`, line-height 1, letter-spacing -0.01em.
- **Right:** two lines, right-aligned, `Websites for artists & artisans` /
  `Georgian Bay, Ontario`. Barlow Condensed 600, 14px, line-height 1.35,
  letter-spacing 0.13em, uppercase.

### 2. Hero
Vertical stack, gap 14px.
- **Kicker:** `Book a free 15-minute chat` — Barlow Condensed 600, 15px,
  letter-spacing 0.16em, uppercase, color #4a4b4d.
- **H1:** `Tell me about your work.` — Barlow Condensed 700 (inherited from the
  design system's `h1`), `clamp(40px, 7vw, 72px)`, line-height 0.92,
  letter-spacing -0.025em, `text-wrap: balance`, margin 0.
- **Paragraph:** `Fifteen minutes, no pitch. What you make, who buys it, and what
  you'd want a site of your own to do. Fill this in and I'll reply with a couple of
  times that suit.` — `clamp(16px, 2vw, 19px)`, line-height 1.45, max-width 46em,
  `text-wrap: pretty`, margin 0.

### 3. Price band
Flex row, `align-items: baseline`, wraps, gap `8px 16px`. Rules top and bottom:
1px solid #1d1f20, padding `11px 0`.
- **`From $999`** — Barlow Condensed 700, `clamp(28px, 4vw, 40px)`, line-height 1,
  letter-spacing -0.01em, `white-space: nowrap`, `flex: none`.
- **`One time · no monthly fee · you own it`** — Barlow Condensed 600, 15px,
  line-height 1.4, letter-spacing 0.13em, uppercase, `flex: 1 1 auto; min-width: 0`
  (so it wraps inside the rule instead of overflowing).
  The separators are `&nbsp;·&nbsp;`.

### 4. The form — a framed card
The `<form>` is the design system's `.card .blueprint`: transparent background,
1px hairline border, **square corners**, with four `+` registration marks at the
corners (`<i class="corner tl|tr|bl|br">`). Gap 18px, padding `clamp(18px, 3vw, 28px)`.
Do not round it and do not give it a fill — see *Design system rules* below.

**Field grid:** `display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 18px`.
Six fields in this order:

| # | Name attr | Label | Control | Required | Placeholder / options |
|---|---|---|---|---|---|
| 1 | `name` | Your name | text | **yes** | — |
| 2 | `email` | Email | `type="email"` | **yes** | — |
| 3 | `phone` | Phone — if texting is easier | `type="tel"` | no | — |
| 4 | `medium` | What you make | text | no | `Painting, pottery, woodwork…` |
| 5 | `town` | Town | text | no | `Collingwood, Meaford…` |
| 6 | `current` | Where you are now | `<select>` | no | see below |

`current` options, in order:
`Instagram or Facebook only` · `Squarespace, Wix or similar` ·
`Etsy or another marketplace` · `An old site that needs replacing` ·
`Nothing online yet`

**Full-width field below the grid:**
`notes` — label `Anything you'd like the site to do`, `<textarea rows="4">`,
placeholder `A catalogue of available work, a mailing list, show dates…`,
line-height 1.45, vertical resize only.

**Field markup:** each field is `.field` wrapping a `<label for>` + `.input`.
Every control carries a real `id` and its label points at it (`bk-name`, `bk-email`,
`bk-phone`, `bk-medium`, `bk-town`, `bk-current`, `bk-notes`).
Label style: Barlow Condensed 600, 14px, letter-spacing 0.13em, uppercase, #1d1f20.
Input style: design system `.input`, overridden to background #fffdf3, font-size 16px
(16px matters — smaller triggers iOS zoom-on-focus), `min-height: 44px` (touch target).

**Action row:** flex, wraps, `align-items: center`, gap 16px.
- **Submit button** — `.btn .btn-primary .blueprint` with the four corner marks.
  The solid accent object on the page: background #1d1f20, text #fdf8e3.
  Barlow Condensed 700, 20px, letter-spacing 0.04em, uppercase, padding `13px 26px`,
  `min-height: 52px`, `white-space: nowrap`. Label: `Send it to James`.
  Hover: #3c3d3f.
- **Fallback line** — `Or text **416-410-8899** · james@portman.ca` — 15px,
  line-height 1.4, color #4a4b4d; the phone in weight 600, the email a `mailto:` link.

### 5. FAQ row
`display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 20px`.
Three `.card .blueprint` cards (hairline frame + corner marks), each with a
`.card-title` (19px) and `.card-body` (15px, color #424244, full opacity):

1. **Can I update it myself?** — "Yes — that's the point. If you'd rather not, send me the photos and I'll post them."
2. **Do I keep my domain and photos?** — "All of it, always — domain, images, and your mailing list. Nothing is held hostage."
3. **Can you move my existing site over?** — "Usually yes, including any archive of past work."

In the prototype this row is behind a `showFaq` boolean (default true). Treat it as
always-on in production unless James asks otherwise.

## States
- **Default** — as described above.
- **Focus** — `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }`
  on every interactive element. Never the browser default ring.
- **Hover** — button #1d1f20 → #3c3d3f. Links #1d1f20 → #3c3d3f.
- **Submitting** — not designed in the prototype. **Add one:** disable the button and
  swap its label (e.g. `Sending…`) so a slow connection can't produce double sends.
- **Success** — a panel appended inside the form card: 1px solid #1d1f20 border,
  background #f7f0d2, padding `14px 16px`, font-size 16px, line-height 1.45. Copy:
  "Thanks — your note is on its way to James. If your email program didn't open,
  write to james@portman.ca or text 416-410-8899."
  **Reword for a server-side submit** — the mail-client caveat no longer applies.
  Suggested: "Thanks — I've got it. I'll reply within a day with a couple of times
  that suit. In a hurry? Text 416-410-8899."
- **Error** — not designed. Same panel geometry, but make the failure legible and
  repeat the phone/email fallbacks.

## Design tokens
The page overrides the bound design system's tokens to get the flier's yellow/black
scheme. Set these on `:root` (or the equivalent theme layer) and the components
re-color together — do not hard-code the hexes per element.

```css
:root{
  --color-bg:         #fdf8e3;  /* page ground, warm paper */
  --color-surface:    #f7f0d2;  /* tinted panel (success message) */
  --color-text:       #1d1f20;  /* near-black ink */
  --color-accent:     #1d1f20;  /* accent IS black in this scheme */
  --color-accent-600: #3c3d3f;  /* hover */
  --color-accent-700: #141516;  /* pressed / deepest */
  --color-divider:    #1d1f20;  /* hairline rules and frames */
}
```

Additional literals used: `#fffdf3` input fill, `#6f7375` muted mark + corner marks,
`#4a4b4d` secondary text, `#424244` card body text.

**Type:** `--font-heading` = Barlow Condensed (400/500/600/700);
`--font-body` = Barlow (400/500/600/700). Google Fonts.

**Spacing / radius:** take from the design system's `--space-*` and `--radius-*`.
Note the visual language is **square** — radius is effectively 0 on cards, inputs and
buttons here; don't introduce rounding.

**Responsive:** fully fluid, no fixed widths. All the `clamp()` values above are the
spec. The field grid and FAQ grid collapse to one column via `auto-fit` + `minmax`.

## Design system rules that must survive the port
The page composes the **Industry** design system (a technical wireframe style).
Its non-negotiables:
- Cards, figures and the primary button are **square-cornered** and **hairline-bordered**.
- Framed elements always keep their four `+` registration marks — never drop them.
- Cards and figures stay **transparent line drawings**; the primary button is the
  single solid filled object on the page.
- Headings condensed (Barlow Condensed), body in Barlow.
- Icons, if any are added, are Lucide at stroke-width 1.5. Do not thicken.
- No decorative color beyond the one accent.
- `_ds/industry-*/styles.css` in this bundle is the real stylesheet and carries the
  full token ramps; `_ds/industry-*/readme.md` is the complete written guide.

## Accessibility notes
- Every input has a programmatic label (`for`/`id` pairs listed above).
- 16px minimum font on inputs; 44px minimum control height; 52px on the submit.
- Ink-on-paper contrast (#1d1f20 on #fdf8e3) is far above 4.5:1. Keep the muted
  greys for secondary text only, not body copy.
- The form must be operable and submittable by keyboard alone.

## Assets
- `qr-georgianartist.png` — the QR code printed on the flier. Encodes
  **`https://www.georgianartist.com/book`** (regenerated 20 Sep 2026; it previously
  encoded `https://portman.ca/book`). Included for reference only; the page doesn't
  display it. Same palette and error-correction level as the original — ink #1d1f20
  on ground #fdf8e3, ECC M — but 29 modules rather than 25, because the URL is longer.
  The quiet zone is now the spec-minimum 4 modules; the original had 2.5.
  **If the booking URL changes again, this image must be regenerated before the flier prints.**
- `qr-georgianartist.svg` — the same code as vector, for print at any size.
- No other images. No icons currently used.

## Screenshots
`screenshots/` holds reference renders:
- `booking-page.png` — booking page, top (masthead, hero, price band).
- `booking-page-form.png` — the framed form card, action row and FAQ cards.
- `01-flier.png` / `02-flier.png` — flier front and back, for tone and palette context.

## Files in this bundle
- `Booking Page.dc.html` — the booking page prototype (**the thing to build**).
- `GeorgianArtist Flier v2.dc.html` — the two-sided print flier that drives traffic
  here. Context for tone, copy and palette; not part of the web build.
- `_ds/industry-000b06d0-c9a5-4dc0-9a5b-5b2c4fbd0b62/` — the bound design system:
  `styles.css` (portable), `readme.md` (full guide), `theme.json` (tokens).
- `qr-georgianartist.png` — see *Assets*.
- `screenshots/` — reference renders, see *Screenshots*.
- `doc-page.js`, `image-slot.js`, `support.js` — runtime helpers for the prototypes.
  Not needed in production.

## Open questions for James
1. Does portman.ca support server-side code, or should this be a serverless function
   or hosted form service?
2. Which mail provider should send the notification?
3. Should the submitter get an autoresponder?
4. Is `/book` definitely the final path? The printed QR cannot change after printing.

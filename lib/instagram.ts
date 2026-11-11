/**
 * Instagram automation — two responsibilities:
 *   1. createMediaContainer()/createReelContainer()/publishMediaContainer() —
 *      publish via the Meta Graph API
 *   2. generateCaption()  — calls Claude to draft a caption from product data
 */

import Anthropic from "@anthropic-ai/sdk";
import { sizeOptions } from "@/data/products";
import { isVideoUrl } from "@/lib/media";
import { siteConfig, bareDomain } from "@/data/siteConfig";
import { productPath } from "@/lib/product-path";

// Re-exported so publishing callers have one import for the whole flow.
export { isVideoUrl };

// ── Constants ─────────────────────────────────────────────────────────────────

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE    = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SITE_BASE     = siteConfig.url;

// Instagram feed posts only accept aspect ratios between 4:5 (0.8, tall) and
// 1.91:1 (1.91, wide). Anything outside that — notably our panoramic photos —
// is rejected by the Graph API with an "Invalid Aspect Ratio" error.
const IG_MIN_RATIO = 0.8;
const IG_MAX_RATIO = 1.91;

// A Reel container is transcoded by Meta before it can be published, so unlike
// an image it has to be polled until it reports FINISHED.
//
// The budget stays well under the route's maxDuration, because publishing
// happens AFTER the poll: a 4s settle, the publish call, and the database write
// recording it. Running out of budget is cheap and self-healing — the cron puts
// the post back to "approved" and retries from scratch. Being killed mid-publish
// is the one failure that cannot be retried: the post is live and nothing knows.
// So the margin always sits on the side of the poll expiring.
//
// 90s against a 120s maxDuration. Previously 35s against 60s, which Meta's
// transcode queue overran on an ordinary 3.4MB reel — normal variance, not a
// fault. The 30s tail is slightly more absolute headroom than the old 25s, so
// the safety property is unchanged while the failure gets rarer.
//
// IG_REEL_POLL_BUDGET_MS overrides this. Raising it past maxDuration minus ~30s
// reintroduces exactly the unrecoverable failure above — move both, or neither.
const REEL_POLL_INTERVAL_MS = 4_000;
const REEL_POLL_BUDGET_MS = Number(process.env.IG_REEL_POLL_BUDGET_MS ?? 90_000);

// Caption model — override with ANTHROPIC_MODEL if this alias is ever retired.
const CAPTION_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

/**
 * Rotating hashtag sets.
 *
 * Previously a single pool of 15 tags went out on every post. Identical tags
 * on every post reads as automation, and several of the old tags were
 * mega-tags (#buyart, #artforsale, #artistsoninstagram, #paintingoftheday)
 * with millions of posts — a new post is buried in them within seconds.
 *
 * These sets are regional-weighted, 9 tags each, and rotate per work, so the
 * account looks alive and each post competes in tags it can actually rank in.
 * Every set keeps #georgianbay (the niche), #oilpainting (the medium) and
 * #georgianartist (the brand).
 */
const HASHTAG_SETS: string[][] = [
  // Bay & escarpment
  ["#georgianbay", "#brucetrail", "#greyhighlands", "#owensound", "#ontarioart",
   "#canadianlandscape", "#landscapepainting", "#fineartprint", "#oilpainting", "#georgianartist"],
  // Blue Mountain & Collingwood
  ["#georgianbay", "#bluemountain", "#collingwood", "#thornbury", "#ontarioartist",
   "#canadianart", "#wallart", "#gallerywrap", "#oilpainting", "#georgianartist"],
  // North shore & islands
  ["#georgianbay", "#manitoulinisland", "#killarney", "#northernontario",
   "#canadianartist", "#ontariolandscape", "#originalart", "#artcollector", "#oilpainting", "#georgianartist"],
  // Rivers & falls
  ["#georgianbay", "#beaverriver", "#inglisfalls", "#greybruce", "#canadianart",
   "#ontarioart", "#landscapeart", "#canvasprints", "#oilpainting", "#georgianartist"],
  // Cottage country & interiors
  ["#georgianbay", "#cottagecountry", "#bluemountain", "#ontariotravel",
   "#canadianartist", "#artforthehome", "#wallartdecor", "#interiordesign", "#oilpainting", "#georgianartist"],
];

/**
 * Which set a region belongs in. A hash alone put Blue Mountain works in the
 * Grey Highlands set and vice versa — place tags that name the wrong place are
 * worse than no place tags, so the work's own category picks the set.
 */
const SETS_BY_CATEGORY: Record<string, number[]> = {
  // More than one set per region where more than one fits: the catalogue is
  // Blue Mountain-heavy, and a single set per region would put identical tags
  // on most of the account again — the problem this replaced.
  "Blue Mountain": [1, 4],
  "Grey Highlands": [0],
  "Owen Sound": [0, 3],  // set 3 carries #inglisfalls
  "Bruce Peninsula": [0],
  Manitoulin: [2],
  Killarney: [2],
  "Beaver River": [3],
  "Georgian Bay": [4, 1],
  "Simcoe County": [4],
};

/**
 * Picks the hashtag set for a work: by region where we know it, otherwise a
 * stable hash of the id so unmapped categories still spread across the sets
 * instead of piling into one.
 */
export function pickHashtagSet(category: string, seed = ""): string[] {
  let h = 0;
  const key = seed || category;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  // A category's own sets when it has any, otherwise any set.
  const candidates = SETS_BY_CATEGORY[category];
  const index = candidates?.[h % candidates.length] ?? h % HASHTAG_SETS.length;
  return HASHTAG_SETS[index] ?? [];
}
// ── Types ─────────────────────────────────────────────────────────────────────

export interface PostProductData {
  id: string;
  slug?: string | null;
  title: string;
  type: "painting" | "photograph";
  category: string;
  sizeType: string;
  price: number;
  description: string | null;
  image: string;          // may be relative (/paintings/…) or absolute blob URL
}

export interface VotingPostData {
  topic: string;          // e.g. "Should I paint Collingwood or Meaford next?"
  optionA: string;        // "Collingwood"
  optionB: string;        // "Meaford"
  imageUrl: string;       // absolute URL
}

// ── Image URL helper ──────────────────────────────────────────────────────────

/** Ensures the image URL is absolute so Meta can fetch it. */
export function absoluteImageUrl(image: string): string {
  if (image.startsWith("http")) return image;
  return `${SITE_BASE}${image}`;
}

// ── Meta Graph API ────────────────────────────────────────────────────────────

async function graphPost(path: string, params: Record<string, string>) {
  const url  = new URL(`${GRAPH_BASE}/${path}`);
  const body = new URLSearchParams({
    ...params,
    access_token: process.env.IG_ACCESS_TOKEN!,
  });
  const res = await fetch(url.toString(), { method: "POST", body });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    throw new Error(
      `Meta API error on ${path}: ${JSON.stringify(json.error ?? json)}`
    );
  }
  return json;
}

async function graphGet(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", process.env.IG_ACCESS_TOKEN!);
  const res = await fetch(url.toString());
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    throw new Error(
      `Meta API error on GET ${path}: ${JSON.stringify(json.error ?? json)}`
    );
  }
  return json;
}


/**
 * Publishing to Instagram is a two-step Graph API flow:
 *   1. createMediaContainer()  — creates a media container (returns a creation_id)
 *   2. publishMediaContainer() — publishes the container (returns the permanent ig media id)
 *
 * These are kept as separate functions so callers can distinguish a failure
 * *before* anything is published (step 1 — safe to retry) from a failure during
 * the publish step (step 2 — the post may already be live, so a blind retry
 * could double-post). See app/api/cron/instagram/route.ts for that handling.
 *
 * The image URL must already be publicly accessible.
 */

/**
 * Coerce an image into Instagram's allowed aspect-ratio range. If the image is
 * already in range the original URL is returned untouched (the common case —
 * most paintings are landscape/square). Otherwise the image is letterboxed onto
 * a white canvas at the nearest valid ratio (preserving the whole image — a
 * clean gallery look for art) and uploaded to Blob, and that URL is returned.
 *
 * sharp runs here rather than in the browser because the cron has no client;
 * it's a single image per post so the serverless cost is negligible.
 */
export async function prepareImageForInstagram(absoluteUrl: string): Promise<string> {
  const sharp = (await import("sharp")).default;
  const { put } = await import("@vercel/blob");

  const res = await fetch(absoluteUrl);
  if (!res.ok) throw new Error(`Could not fetch image ${absoluteUrl}: ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error(`Could not read image dimensions for ${absoluteUrl}`);

  const ratio = w / h;
  if (ratio >= IG_MIN_RATIO && ratio <= IG_MAX_RATIO) return absoluteUrl; // already fine

  // Out of range — letterbox onto white. Too wide → grow height to hit 1.91;
  // too tall → grow width to hit 0.8.
  let top = 0, bottom = 0, left = 0, right = 0;
  if (ratio > IG_MAX_RATIO) {
    const finalH = Math.round(w / IG_MAX_RATIO);
    const pad = finalH - h;
    top = Math.floor(pad / 2);
    bottom = pad - top;
  } else {
    const finalW = Math.round(h * IG_MIN_RATIO);
    const pad = finalW - w;
    left = Math.floor(pad / 2);
    right = pad - left;
  }

  const padded = await sharp(input)
    .extend({ top, bottom, left, right, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .jpeg({ quality: 90 })
    .toBuffer();

  const name = absoluteUrl.split("/").pop()?.replace(/\.[a-z]+$/i, "") ?? "post";
  const blob = await put(`igready/${name}.jpg`, padded, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Step 1 — create the media container. Nothing is published yet, so a thrown
 *  error here means it's safe to retry later. The image is first coerced into
 *  Instagram's allowed aspect ratio (panoramics would otherwise be rejected). */
/**
 * A cheap content fingerprint for a media URL: the ETag and length the server
 * reports, without downloading the body.
 *
 * Returns null when it cannot be read (network error, no headers). Callers
 * MUST treat null as "unknown", never as "changed" — refusing to post because
 * a HEAD request failed would be worse than the problem it guards against.
 */
export async function fetchMediaFingerprint(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (!res.ok) return null;
    const etag = res.headers.get("etag");
    const len = res.headers.get("content-length");
    if (!etag && !len) return null;
    return `${etag ?? ""}|${len ?? ""}`;
  } catch {
    return null;
  }
}

/**
 * Whether the media behind a queued post has been replaced since its caption
 * was written.
 *
 * Only a confident mismatch counts. No stored baseline (an older row) or an
 * unreadable current value means "don't know", which must not block a post.
 */
export function mediaHasChanged(stored: string | null, current: string | null): boolean {
  if (!stored || !current) return false;
  return stored !== current;
}

export async function createMediaContainer(
  absoluteUrl: string,
  caption: string
): Promise<{ id: string; temporaryUrl: string | null }> {
  const accountId = process.env.IG_BUSINESS_ACCOUNT_ID!;
  const imageUrl = await prepareImageForInstagram(absoluteUrl);

  // Non-null ONLY when letterboxing uploaded a new blob. prepareImageForInstagram
  // returns its input untouched when the ratio is already valid, and that input
  // is the product's own image — deleting it would take a live page down. The
  // identity comparison is the whole safety argument for discardPreparedImage.
  const temporaryUrl = imageUrl === absoluteUrl ? null : imageUrl;

  const container = await graphPost(`${accountId}/media`, {
    image_url: imageUrl,
    caption,
  }) as { id: string };
  return { id: container.id, temporaryUrl };
}

/**
 * Delete a letterboxed copy once Instagram no longer needs it.
 *
 * These live under igready/ and are written on every out-of-ratio post. Nothing
 * in the database ever points at one: Meta fetches it while building the media
 * container and keeps its own copy, so after publishing it is pure litter.
 *
 * Only ever pass the temporaryUrl handed back by createMediaContainer. Never
 * throws — a stranded blob costs a few hundred KB, while a failure here would
 * turn a successful post into an error.
 */
export async function discardPreparedImage(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(url);
  } catch (e) {
    console.error(
      `[instagram] could not delete prepared image ${url}:`,
      e instanceof Error ? e.message : String(e)
    );
  }
}

/** Step 2 — publish a previously-created container. A thrown error here is
 *  ambiguous: the post may or may not have gone live, so callers must NOT
 *  blindly retry (that risks a duplicate public post). */
export async function publishMediaContainer(creationId: string): Promise<string> {
  const accountId = process.env.IG_BUSINESS_ACCOUNT_ID!;

  // Brief pause — Meta recommends letting the container process before publish
  await new Promise((r) => setTimeout(r, 4_000));

  const published = await graphPost(`${accountId}/media_publish`, {
    creation_id: creationId,
  }) as { id: string };

  return published.id;
}

/**
 * A media container's state, from Meta. "PUBLISHED" means it went live;
 * "FINISHED" means it is ready and has NOT been published (a container can be
 * published only once, so publishing it now cannot duplicate a post);
 * "EXPIRED" (after 24 hours) and "ERROR" mean it never will be; "IN_PROGRESS"
 * means Meta is still processing it.
 */
export async function getContainerStatus(containerId: string): Promise<string> {
  const res = (await graphGet(containerId, { fields: "status_code" })) as { status_code?: string };
  if (!res.status_code) throw new Error(`No status_code for container ${containerId}`);
  return res.status_code;
}

/**
 * The media id of a post that went live, found by its caption among the
 * account's recent posts. The container doesn't name the media it became, so
 * this is how a reconciled post gets its instagramId; null when it can't be
 * found, which leaves an honest gap rather than a guess.
 */
export async function findPublishedMediaId(caption: string, since: Date | null): Promise<string | null> {
  const accountId = process.env.IG_BUSINESS_ACCOUNT_ID!;
  const res = (await graphGet(`${accountId}/media`, {
    fields: "id,caption,timestamp",
    limit: "25",
  })) as { data?: { id: string; caption?: string; timestamp?: string }[] };
  const floor = since ? since.getTime() - 10 * 60_000 : 0;
  const match = (res.data ?? []).find(
    (m) =>
      (m.caption ?? "").trim() === caption.trim() &&
      (!m.timestamp || new Date(m.timestamp).getTime() >= floor)
  );
  return match?.id ?? null;
}

/**
 * Step 1 for a Reel. Same two-step flow as an image, with one addition: Meta
 * transcodes the video asynchronously, so the container has to reach FINISHED
 * before it can be published. Publishing an IN_PROGRESS container fails, and
 * the failure lands in the ambiguous step-2 branch — so the wait happens here,
 * in step 1, where a failure is unambiguously safe to retry.
 *
 * No aspect-ratio coercion: the Reel files are already 1080x1920.
 */
export async function createReelContainer(
  videoUrl: string,
  caption: string,
  coverUrl?: string
): Promise<string> {
  const accountId = process.env.IG_BUSINESS_ACCOUNT_ID!;
  const params: Record<string, string> = {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
  };
  if (coverUrl) params.cover_url = coverUrl;

  const container = (await graphPost(`${accountId}/media`, params)) as { id: string };
  await waitForContainer(container.id);
  return container.id;
}

/** Polls a video container until Meta has finished transcoding it. Throws on
 *  ERROR, EXPIRED, or if the budget runs out — all safe-to-retry states, since
 *  nothing has been published at this point. */
async function waitForContainer(containerId: string): Promise<void> {
  const deadline = Date.now() + REEL_POLL_BUDGET_MS;

  while (Date.now() < deadline) {
    const res = (await graphGet(containerId, {
      fields: "status_code,status",
    })) as { status_code?: string; status?: string };

    if (res.status_code === "FINISHED") return;
    if (res.status_code === "ERROR" || res.status_code === "EXPIRED") {
      throw new Error(
        `Reel container ${containerId} ${res.status_code}: ${res.status ?? "no detail"}`
      );
    }
    await new Promise((r) => setTimeout(r, REEL_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Reel container ${containerId} was still processing after ${
      REEL_POLL_BUDGET_MS / 1000
    }s (not published). It will be retried from scratch on the next run.`
  );
}

/**
 * Lightweight check that the Instagram access token still works. A token can be
 * invalidated out from under us (password change, app revoke, Meta policy) even
 * though it has no fixed expiry — this lets the cron detect that and alert
 * rather than silently failing to post. Read-only; safe to call on every run.
 */
export async function verifyInstagramToken(): Promise<{ ok: boolean; detail: string }> {
  const accountId = process.env.IG_BUSINESS_ACCOUNT_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!accountId || !token) {
    return { ok: false, detail: "IG_ACCESS_TOKEN or IG_BUSINESS_ACCOUNT_ID not set" };
  }
  try {
    const url = new URL(`${GRAPH_BASE}/${accountId}`);
    url.searchParams.set("fields", "username");
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    const json = (await res.json()) as { username?: string; error?: unknown };
    if (!res.ok || json.error) {
      return { ok: false, detail: JSON.stringify(json.error ?? json) };
    }
    return { ok: true, detail: `@${json.username}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

// ── Caption generation ────────────────────────────────────────────────────────

/**
 * The voice both caption prompts share. It used to live in two copies that had
 * drifted: the voting prompt had lost the shop, the sales context and the
 * published-verbatim contract, and named a different voice.
 */
const BRAND_VOICE = `You write Instagram captions for ${siteConfig.artist}, a ${siteConfig.locality}–based artist \
who sells archival canvas prints of digital paintings and fine-art photographs at ${bareDomain()}.

Voice: warm, evocative, personal — as if ${siteConfig.artistShortName} is speaking directly. \
Never use generic marketing clichés ("beautiful", "stunning", "timeless"). \
Paint a picture with words: reference light, season, water, trees, rock, sky. \
Keep it under 200 words total, hashtags included — past that the caption runs long below the "...more" fold and readers stop.

Reply with the caption text only — no preamble, no notes, no alternatives. \
Your reply is published to Instagram exactly as written.`;

/**
 * The price range a caption for this work should quote, e.g. "CA$89–CA$279".
 *
 * Both ends must come from the SAME scale. This used to read the sale floor
 * against the regular ceiling, which invents a range nobody can pay: an
 * ultrawide came out as "CA$89–CA$435" when the actual choice is CA$89–279 on
 * sale (CA$139–435 off it). salePrice is what the detail page, the JSON-LD
 * AggregateOffer and the Buy Now button all quote, so the caption follows it.
 */
export function priceRangeFor(sizeType: string, price: number): string {
  const sizes = sizeOptions[sizeType as keyof typeof sizeOptions] ?? [];
  if (sizes.length <= 1) return `CA$${price}`;
  const sale = sizes.map((s) => s.salePrice);
  return `CA$${Math.min(...sale)}–CA$${Math.max(...sale)}`;
}

/**
 * True if the caption quotes a CA$ range that isn't the current one.
 *
 * Used to find captions written under the old sale-floor-to-regular-ceiling
 * bug so they can be regenerated, and to stop the regenerate pass from
 * rewriting captions that are already right. Deliberately forgiving about how
 * Claude wrote the range — "CA$119–$399", "CA$119-399" and "CA$119 – CA$399"
 * are all the same claim. A caption that names no range at all is not stale.
 */
export function captionPriceIsStale(caption: string, sizeType: string, price: number): boolean {
  const quoted = caption.match(/CA\$\s?(\d[\d,]*)\s*[–—-]\s*(?:CA)?\$?\s?(\d[\d,]*)/);
  if (!quoted) return false;
  const num = (s: string) => Number(s.replace(/,/g, ""));
  const [, lo = "", hi = ""] = quoted;
  const expected = priceRangeFor(sizeType, price).match(/(\d+)–CA\$(\d+)/);
  if (!expected) return false;
  return num(lo) !== Number(expected[1]) || num(hi) !== Number(expected[2]);
}

/** Exported for tests: the price line is the part that has gone wrong in public. */
export function buildProductContext(product: PostProductData): string {
  const priceRange = priceRangeFor(product.sizeType, product.price);

  return [
    `Type: ${product.type === "painting" ? "Digital painting" : "Fine-art photograph"} (print)`,
    `Title: "${product.title}"`,
    `Location / category: ${product.category}`,
    `Description: ${product.description ?? "(none provided)"}`,
    `Price range: ${priceRange} — what a buyer pays today, printed on archival canvas`,
    `Site URL: ${SITE_BASE}${productPath(product)}`,
  ].join("\n");
}

/** Generate a product caption via Claude. */
export async function generateCaption(product: PostProductData): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const hashtags = pickHashtagSet(product.category, product.id);

  const systemPrompt = `${BRAND_VOICE}

Structure: hook sentence → 1–2 sentences of scene/story → availability blurb → hashtags.
Open with the place name — the first line is what Instagram search indexes \
and what shows above the "...more" fold.
If you mention price, quote the given range verbatim. Never round it, re-derive \
it from the sizes, or name a figure that isn't in it — a wrong price is a wrong \
price in public.
End with exactly these hashtags (no more, no fewer):
${hashtags.join(" ")}`;

  const userPrompt = `Write an Instagram caption for this artwork:\n\n${buildProductContext(product)}`;

  const message = await client.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no text");
  return text.text.trim();
}

/** Generate a "vote on my next subject" caption via Claude. */
export async function generateVotingCaption(data: VotingPostData): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: CAPTION_MODEL,
    max_tokens: 400,
    system: `${BRAND_VOICE}

This is a "vote on my next subject" post — curious and inviting rather than \
for-sale. End with a call to vote: tell followers to comment "1" for option A \
and "2" for option B.
Close with hashtags: ${pickHashtagSet("", data.topic).join(" ")} #artvote`,
    messages: [
      {
        role: "user",
        content: `Write a voting post caption. Topic: "${data.topic}". \
Option A: "${data.optionA}". Option B: "${data.optionB}".`,
      },
    ],
  });

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Claude returned no text");
  return text.text.trim();
}

// ── Scheduling helpers ────────────────────────────────────────────────────────

const POSTING_DAYS = [1, 3, 5]; // Mon, Wed, Fri

/**
 * Returns the next Mon/Wed/Fri date at 11:00 EDT (15:00 UTC)
 * that doesn't already have a scheduled approved post.
 */
export function nextPostingSlot(occupiedDates: Date[]): Date {
  const occupied = new Set(
    occupiedDates.map((d) => d.toISOString().slice(0, 10))
  );

  const now   = new Date();
  // Start checking from tomorrow to avoid same-day conflicts with the cron
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() + 1);
  start.setUTCHours(15, 0, 0, 0); // 11 am EDT

  for (let i = 0; i < 60; i++) {
    const candidate = new Date(start);
    candidate.setUTCDate(start.getUTCDate() + i);
    const dayOfWeek = candidate.getUTCDay();
    if (!POSTING_DAYS.includes(dayOfWeek)) continue;
    const key = candidate.toISOString().slice(0, 10);
    if (!occupied.has(key)) return candidate;
  }

  // Fallback — should never happen in 60 days unless the calendar is jammed
  throw new Error("Could not find an open posting slot in the next 60 days");
}

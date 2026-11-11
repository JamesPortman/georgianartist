"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/app/actions/admin";
import {
  absoluteImageUrl,
  captionPriceIsStale,
  fetchMediaFingerprint,
  generateCaption,
  generateVotingCaption,
  nextPostingSlot,
  verifyInstagramToken,
  isVideoUrl,
} from "@/lib/instagram";
import type { PostProductData } from "@/lib/instagram";
import { publishQueuedPost, reconcilePosting } from "@/lib/instagram-publish";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QueuePost = {
  id: string;
  type: "painting" | "photograph" | "voting" | "press" | "reel";
  productId: string | null;
  imageUrl: string;
  caption: string;
  status: "pending" | "approved" | "posting" | "posted" | "skipped";
  scheduledAt: string | null;
  postedAt: string | null;
  instagramId: string | null;
  createdAt: string;
};

function toQueuePost(p: {
  id: string;
  type: string;
  productId: string | null;
  imageUrl: string;
  caption: string;
  status: string;
  scheduledAt: Date | null;
  postedAt: Date | null;
  instagramId: string | null;
  createdAt: Date;
}): QueuePost {
  return {
    id: p.id,
    type: p.type as QueuePost["type"],
    productId: p.productId,
    imageUrl: p.imageUrl,
    caption: p.caption,
    status: p.status as QueuePost["status"],
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    postedAt: p.postedAt?.toISOString() ?? null,
    instagramId: p.instagramId,
    createdAt: p.createdAt.toISOString(),
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getQueueAction(): Promise<QueuePost[]> {
  await requireAuth();
  const posts = await prisma.instagramPost.findMany({
    where: { status: { in: ["pending", "approved"] } },
    // Approved rows are shown with their scheduled date, so they must sort by
    // it — ordering them by createdAt put a post scheduled for the 14th below
    // one scheduled for the 18th, purely because it was queued later.
    // Pending rows have no scheduledAt yet, so nulls sort last and fall through
    // to createdAt, which is the order they were generated in.
    // ("approved" sorts before "pending" alphabetically, which is the grouping
    // the page wants anyway.)
    orderBy: [
      { status: "asc" },
      { scheduledAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });
  return posts.map(toQueuePost);
}

export async function getPostedAction(): Promise<QueuePost[]> {
  await requireAuth();
  const posts = await prisma.instagramPost.findMany({
    where: { status: "posted" },
    orderBy: { postedAt: "desc" },
    take: 20,
  });
  return posts.map(toQueuePost);
}

/**
 * Rows stranded in "posting".
 *
 * A publish that errors after the media container was created is ambiguous —
 * the post may or may not be live — so it is deliberately left in "posting"
 * and never auto-retried. Those rows matched no section on this page and so
 * appeared nowhere at all; the only notice was an alert email. This surfaces
 * them so they can be resolved deliberately.
 */
export async function getNeedsReviewAction(): Promise<QueuePost[]> {
  await requireAuth();
  const posts = await prisma.instagramPost.findMany({
    where: { status: "posting" },
    orderBy: { scheduledAt: { sort: "asc", nulls: "last" } },
  });
  return posts.map(toQueuePost);
}

// ── Generate ──────────────────────────────────────────────────────────────────

/**
 * Pull unposted visible products from the DB, generate captions via Claude,
 * and add them to the queue as "pending".
 * Returns how many new posts were queued.
 */
export async function generatePostsAction(count: number = 6): Promise<{ added: number; error?: string }> {
  await requireAuth();

  // Skip any product that already has a post record — including "skipped"
  // (skipping is a deliberate "never queue this again" signal) and "posting".
  const existing = await prisma.instagramPost.findMany({
    where: { productId: { not: null } },
    select: { productId: true },
  });
  const usedIds = new Set(existing.map((e) => e.productId).filter(Boolean) as string[]);

  // Fetch candidates — alternate painting / photograph
  const [paintings, photographs] = await Promise.all([
    prisma.product.findMany({
      // Sold-out work never enters the queue: a caption quotes a price range
      // and invites a purchase, and the cron would publish it weeks later.
      where: { type: "painting", visible: true, soldOut: false, id: { notIn: [...usedIds] } },
      orderBy: { sortOrder: "asc" },
      take: Math.ceil(count * 0.67),
    }),
    prisma.product.findMany({
      where: { type: "photograph", visible: true, soldOut: false, id: { notIn: [...usedIds] } },
      orderBy: { sortOrder: "asc" },
      take: Math.ceil(count * 0.33),
    }),
  ]);

  // Interleave: painting, painting, photo, painting, painting, photo, …
  const candidates: typeof paintings = [];
  const p = [...paintings];
  const q = [...photographs];
  while (candidates.length < count && (p.length || q.length)) {
    for (const next of [p.shift(), p.shift(), q.shift()]) {
      if (next && candidates.length < count) candidates.push(next);
    }
  }

  let added = 0;
  const errors: string[] = [];

  for (const product of candidates) {
    try {
      const productData: PostProductData = {
        id: product.id,
        title: product.title,
        type: product.type as "painting" | "photograph",
        category: product.category,
        sizeType: product.sizeType,
        price: product.price,
        description: product.description,
        image: product.image,
      };
      const caption  = await generateCaption(productData);
      const imageUrl = absoluteImageUrl(product.image);

      await prisma.instagramPost.create({
        data: {
          type: product.type,
          productId: product.id,
          imageUrl,
          caption,
          status: "pending",
          // What the artwork looked like when this caption was written. The
          // cron refuses to publish if it has changed since.
          mediaFingerprint: await fetchMediaFingerprint(imageUrl),
        },
      });
      added++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${product.id}: ${msg}`);
    }
  }

  revalidatePath("/admin/instagram");
  return { added, error: errors.length > 0 ? errors.join("; ") : undefined };
}

// ── Approve ───────────────────────────────────────────────────────────────────

export async function approvePostAction(id: string): Promise<{ error?: string }> {
  await requireAuth();

  // Find the next open Mon/Wed/Fri slot
  const scheduled = await prisma.instagramPost.findMany({
    where: { status: "approved", scheduledAt: { not: null } },
    select: { scheduledAt: true },
  });
  const occupiedDates = scheduled
    .map((s) => s.scheduledAt)
    .filter((d): d is Date => d !== null);

  let slot: Date;
  try {
    slot = nextPostingSlot(occupiedDates);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not find a posting slot" };
  }

  // Never re-queue a post that is live or going live: approving it again
  // would publish it a second time.
  const approved = await prisma.instagramPost.updateMany({
    where: { id, status: { notIn: ["posted", "posting"] } },
    data: { status: "approved", scheduledAt: slot },
  });
  if (approved.count !== 1) return { error: "This post has already been published, or is being published now." };

  revalidatePath("/admin/instagram");
  return {};
}

// ── Edit caption ──────────────────────────────────────────────────────────────

export async function updateCaptionAction(id: string, caption: string): Promise<{ error?: string }> {
  await requireAuth();
  if (!caption.trim()) return { error: "Caption cannot be empty" };
  await prisma.instagramPost.update({ where: { id }, data: { caption: caption.trim() } });
  revalidatePath("/admin/instagram");
  return {};
}

// ── Skip ──────────────────────────────────────────────────────────────────────

export async function skipPostAction(id: string): Promise<void> {
  await requireAuth();
  await prisma.instagramPost.update({ where: { id }, data: { status: "skipped" } });
  revalidatePath("/admin/instagram");
}

// ── Unapprove / move back to pending ─────────────────────────────────────────

export async function unapprovePostAction(id: string): Promise<void> {
  await requireAuth();
  await prisma.instagramPost.update({
    where: { id },
    data: { status: "pending", scheduledAt: null },
  });
  revalidatePath("/admin/instagram");
}

// ── Publish immediately ───────────────────────────────────────────────────────

/**
 * Publish an approved post right now, instead of waiting for its scheduled
 * slot. Runs the same sequence as the cron (lib/instagram-publish.ts), so the
 * fingerprint check and the duplicate-post guards all apply.
 *
 * Approved-only on purpose: approval is the review gate, and a caption that
 * hasn't been through it shouldn't reach the account by a different door. To
 * post a pending item immediately, approve it first — the slot it takes is
 * released the moment this publishes it.
 */
export async function publishNowAction(id: string): Promise<{ error?: string }> {
  await requireAuth();

  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_BUSINESS_ACCOUNT_ID) {
    return { error: "Instagram credentials are not configured on this deployment." };
  }

  const post = await prisma.instagramPost.findUnique({ where: { id } });
  if (!post) return { error: "Post not found" };

  // Anything other than "approved" means the cron either can't have it or has
  // already taken it. "posting" in particular may be live on Instagram right
  // now — publishing again would duplicate it publicly.
  if (post.status !== "approved") {
    const why: Record<string, string> = {
      pending: "Approve it first. Approval is the review step.",
      posting: "This post is mid-publish or was left for review after an error. Check the Instagram account before doing anything else with it.",
      posted: "This one has already been published.",
      skipped: "This post was skipped.",
    };
    return { error: why[post.status] ?? `Cannot publish a post with status "${post.status}".` };
  }

  // Checked here rather than letting the Graph call fail: a dead token is the
  // most likely reason for this to go wrong, and it deserves a plain answer.
  const health = await verifyInstagramToken();
  if (!health.ok) {
    return { error: `Instagram token is not working: ${health.detail}` };
  }

  const result = await publishQueuedPost(post, "manual");
  revalidatePath("/admin/instagram");

  if (result.outcome === "held") return { error: result.reason };

  if (result.outcome === "failed") {
    return {
      error: result.leftPosting
        ? `Publishing errored after the media container was created, so this post may or may not be live. It has been left in "posting" and will NOT retry. Check Instagram before touching it. Detail: ${result.error}`
        : `Could not publish: ${result.error}`,
    };
  }

  return {};
}

// ── Resolving a stranded "posting" row ────────────────────────────────────────

/**
 * Ask Meta what became of a stranded post, by its media container, and settle
 * it: recorded if it went live, published now if its container is ready but
 * never went out, requeued if the container expired. Only when Meta can't say
 * does it stay here for the two manual buttons below.
 */
export async function checkWithInstagramAction(id: string): Promise<{ error?: string }> {
  await requireAuth();

  const post = await prisma.instagramPost.findUnique({ where: { id } });
  if (!post) return { error: "Post not found" };
  if (post.status !== "posting") {
    return { error: `This post is "${post.status}", not awaiting review. Reload the page.` };
  }

  const r = await reconcilePosting(post, {
    label: post.productId ?? post.type,
    isReel: post.type === "reel" || isVideoUrl(post.imageUrl),
  });
  revalidatePath("/admin/instagram");
  if (r.result === "unknown") {
    return { error: `Instagram couldn't settle it (${r.detail}). Check the account, then use one of the buttons.` };
  }
  return {};
}

/**
 * The post did NOT reach Instagram — put it back in the queue.
 *
 * Its original scheduled date is kept. If that date has passed the cron picks
 * it up on its next run, which is what "overdue" handling is for.
 *
 * Only ever call this after checking the account: if the post IS live, this
 * queues a duplicate.
 */
export async function returnToQueueAction(id: string): Promise<{ error?: string }> {
  await requireAuth();

  const post = await prisma.instagramPost.findUnique({ where: { id } });
  if (!post) return { error: "Post not found" };
  if (post.status !== "posting") {
    return { error: `This post is "${post.status}", not awaiting review. Reload the page.` };
  }

  await prisma.instagramPost.update({
    where: { id },
    data: { status: "approved", containerId: null, postingStartedAt: null },
  });

  revalidatePath("/admin/instagram");
  return {};
}

/**
 * The post DID reach Instagram — record it as posted so it leaves the queue.
 *
 * instagramId stays null: the publish call never returned one, and inventing a
 * value would be worse than an honest gap in the history.
 */
export async function markAsPostedAction(id: string): Promise<{ error?: string }> {
  await requireAuth();

  const post = await prisma.instagramPost.findUnique({ where: { id } });
  if (!post) return { error: "Post not found" };
  if (post.status !== "posting") {
    return { error: `This post is "${post.status}", not awaiting review. Reload the page.` };
  }

  await prisma.instagramPost.update({
    where: { id },
    data: { status: "posted", postedAt: post.postedAt ?? new Date(), postingStartedAt: null },
  });

  revalidatePath("/admin/instagram");
  return {};
}

// ── Voting posts ──────────────────────────────────────────────────────────────

export async function createVotingPostAction(formData: FormData): Promise<{ error?: string }> {
  await requireAuth();

  const topic   = (formData.get("topic") as string)?.trim();
  const optionA = (formData.get("optionA") as string)?.trim();
  const optionB = (formData.get("optionB") as string)?.trim();
  const imageUrl = (formData.get("imageUrl") as string)?.trim();

  if (!topic || !optionA || !optionB || !imageUrl) {
    return { error: "All fields are required." };
  }

  try {
    const caption = await generateVotingCaption({ topic, optionA, optionB, imageUrl });
    await prisma.instagramPost.create({
      data: {
        type: "voting", productId: null, imageUrl, caption, status: "pending",
        mediaFingerprint: await fetchMediaFingerprint(imageUrl),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Could not generate voting caption: ${msg}` };
  }

  revalidatePath("/admin/instagram");
  return {};
}

// ── Regenerate caption ────────────────────────────────────────────────────────

export async function regenerateCaptionAction(id: string): Promise<{ error?: string }> {
  await requireAuth();

  const post = await prisma.instagramPost.findUnique({ where: { id } });
  if (!post) return { error: "Post not found" };
  if (!post.productId) return { error: "Can only regenerate captions for product posts" };

  const product = await prisma.product.findUnique({ where: { id: post.productId } });
  if (!product) return { error: "Product not found" };

  try {
    const caption = await generateCaption({
      id: product.id,
      title: product.title,
      type: product.type as "painting" | "photograph",
      category: product.category,
      sizeType: product.sizeType,
      price: product.price,
      description: product.description,
      image: product.image,
    });
    // Re-baseline: the caption now describes the artwork as it is today, so
    // the fingerprint must move with it. Without this a post held back for a
    // stale caption would stay held even after being fixed.
    await prisma.instagramPost.update({
      where: { id },
      data: { caption, mediaFingerprint: await fetchMediaFingerprint(post.imageUrl) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Claude error: ${msg}` };
  }

  revalidatePath("/admin/instagram");
  return {};
}

// ── Regenerate stale-priced captions ──────────────────────────────────────────

/**
 * Rewrites every queued caption whose quoted price range is out of date.
 *
 * Captions were drafted from a range built out of the sale floor and the
 * REGULAR ceiling — "CA$89–CA$435" for a work you can actually buy for
 * CA$89–279. Every queued caption carried it, approved ones included, and a
 * caption is published unedited. `captionPriceIsStale` is the filter, so this
 * is idempotent: run it until it reports nothing remaining, and it will never
 * rewrite a caption that is already correct.
 *
 * Batched because each caption is a Claude call and the whole queue would not
 * fit in one request. Status and schedule are left alone — an approved post
 * keeps its slot, it just stops quoting a price nobody can pay.
 *
 * Lives here rather than in a script because ANTHROPIC_API_KEY is
 * Production-only in Vercel; this runs in production, a local script can't.
 */
export async function regenerateStaleCaptionsAction(
  limit: number = 6
): Promise<{ fixed: number; remaining: number; error?: string }> {
  await requireAuth();

  const posts = await prisma.instagramPost.findMany({
    where: { status: { in: ["pending", "approved"] }, productId: { not: null } },
    orderBy: [
      { status: "asc" },
      { scheduledAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });

  // Read the catalogue now, not from whatever queued the post — sizeType and
  // price are exactly the fields that drift.
  const ids = [...new Set(posts.map((p) => p.productId!))];
  const products = ids.length
    ? await prisma.product.findMany({ where: { id: { in: ids } } })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  const stale = posts.filter((post) => {
    const product = byId.get(post.productId!);
    return product && captionPriceIsStale(post.caption, product.sizeType, product.price);
  });

  let fixed = 0;
  const errors: string[] = [];

  for (const post of stale.slice(0, Math.max(1, limit))) {
    const product = byId.get(post.productId!)!;
    try {
      const caption = await generateCaption({
        id: product.id,
        title: product.title,
        // A reel's caption is drafted from the painting, the same way
        // queue-reels.ts drafted it in the first place.
        type: product.type as "painting" | "photograph",
        category: product.category,
        sizeType: product.sizeType,
        price: product.price,
        description: product.description,
        image: product.image,
      });
      await prisma.instagramPost.update({
        where: { id: post.id },
        data: { caption, mediaFingerprint: await fetchMediaFingerprint(post.imageUrl) },
      });
      fixed++;
    } catch (e) {
      errors.push(`${post.productId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  revalidatePath("/admin/instagram");
  return {
    fixed,
    remaining: stale.length - fixed,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

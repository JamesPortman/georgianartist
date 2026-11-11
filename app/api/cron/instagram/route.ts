import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isVideoUrl, verifyInstagramToken } from "@/lib/instagram";
import { publishQueuedPost, reconcilePosting } from "@/lib/instagram-publish";
import { sendAlert } from "@/lib/notify";
import { isCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// A Reel container has to be transcoded by Meta before it can be published, so
// this route can sit and poll for up to IG_REEL_POLL_BUDGET_MS. Image posts
// still finish in seconds. Raise this only alongside the poll budget, and only
// as far as the Vercel plan allows.
//
// Was 60s, which gave the poll 35s. Meta's transcode queue overran that on a
// perfectly ordinary 3.4MB reel (ravenna-canola-painting, 18 Sep 2026) — it
// failed safely and retried, but the failure is avoidable. Vercel's ceiling is
// 300s; 120 buys a 90s poll while keeping more absolute headroom for the
// publish than before.
export const maxDuration = 120;

/**
 * Instagram posting cron — runs Mon / Wed / Fri at 15:00 UTC (11 am EDT).
 * Finds the approved post scheduled for today and publishes it via the Meta
 * Graph API. Protected by CRON_SECRET (same secret as the backup cron).
 *
 * The publishing sequence itself lives in lib/instagram-publish.ts, shared
 * with the "Post now" button in /admin/instagram — the duplicate-post guards
 * only work while there is one copy of them.
 *
 * vercel.json schedule: "0 15 * * 1,3,5"
 */
export async function GET(request: Request) {
  // Auth — Vercel sends the secret in the Authorization header
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // IG credentials must be set
  if (!process.env.IG_ACCESS_TOKEN || !process.env.IG_BUSINESS_ACCOUNT_ID) {
    return NextResponse.json(
      { error: "IG_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID must be set in env" },
      { status: 500 }
    );
  }

  // Proactive token health check. The token has no fixed expiry but can be
  // invalidated (password change, app revoke, Meta policy) — this catches that
  // and alerts even on days when no post is due, instead of failing silently.
  const health = await verifyInstagramToken();
  if (!health.ok) {
    await sendAlert(
      "Instagram token invalid: posting is paused",
      [
        "The Instagram access token failed its health check, so scheduled posts cannot publish until it is renewed.",
        "",
        `Detail: ${health.detail}`,
        "",
        "To fix: regenerate IG_ACCESS_TOKEN via the Graph API Explorer (app GeorgianArtist, permissions instagram_basic + instagram_content_publish + pages_show_list + pages_read_engagement, then GET {pageId}?fields=access_token) and update it in Vercel.",
      ].join("\n")
    );
    return NextResponse.json({ error: "Instagram token invalid", detail: health.detail }, { status: 500 });
  }

  // Settle anything a previous run left in "posting" before posting anything
  // new: each one is asked about by its container, so a post that did go out
  // is recorded and one that didn't goes back in the queue (and may be the one
  // published below).
  const stranded = await prisma.instagramPost.findMany({
    where: { status: "posting" },
    select: { id: true, type: true, productId: true, imageUrl: true, caption: true, containerId: true, postingStartedAt: true },
    take: 5,
  });
  const reconciled: Record<string, string> = {};
  for (const row of stranded) {
    const r = await reconcilePosting(row, {
      label: row.productId ?? row.type,
      isReel: row.type === "reel" || isVideoUrl(row.imageUrl),
    });
    reconciled[row.id] = r.result;
  }

  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  // Find the approved post scheduled for today (or overdue — catches missed crons)
  const post = await prisma.instagramPost.findFirst({
    where: {
      status: "approved",
      scheduledAt: { lte: todayEnd },
    },
    orderBy: { scheduledAt: "asc" },
  });

  if (!post) {
    return NextResponse.json({ ok: true, message: "No post scheduled for today", reconciled });
  }

  const result = await publishQueuedPost(post, "cron");

  if (result.outcome === "held") {
    // Held for one of two reasons now — the artwork was repainted, or the work
    // is no longer listed — so report whichever it was rather than assuming.
    return NextResponse.json({
      ok: true,
      held: post.id,
      reason: result.reason,
      productId: post.productId,
    });
  }

  if (result.outcome === "failed") {
    return NextResponse.json(
      result.leftPosting
        ? { error: result.error, post: post.id, status: "posting" }
        : { error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    posted: post.id,
    instagramId: result.instagramId,
    type: post.type,
    media: result.isReel ? "reel" : "image",
    productId: post.productId,
  });
}

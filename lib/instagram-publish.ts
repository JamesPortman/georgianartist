import { prisma } from "@/lib/db";
import {
  createMediaContainer,
  createReelContainer,
  discardPreparedImage,
  fetchMediaFingerprint,
  findPublishedMediaId,
  getContainerStatus,
  isVideoUrl,
  mediaHasChanged,
  publishMediaContainer,
} from "@/lib/instagram";
import { sendAlert } from "@/lib/notify";

/** The fields publishing needs — an InstagramPost row satisfies this. */
export type PublishablePost = {
  id: string;
  type: string;
  productId: string | null;
  imageUrl: string;
  caption: string;
  mediaFingerprint: string | null;
};

export type PublishResult =
  | { outcome: "posted"; instagramId: string; isReel: boolean }
  | { outcome: "held"; reason: string }
  | { outcome: "failed"; error: string; leftPosting: boolean };

/**
 * Record a successful publish, retrying a few times before giving up.
 *
 * By the time this runs the post is already live on Instagram, so a failed
 * write is the worst state the system has: the account and the database
 * disagree, and nothing can put that right automatically. A Neon cold start or
 * a dropped connection is the usual cause and clears on the second attempt,
 * which is most of this failure class gone for the cost of two retries.
 *
 * Backoff is deliberately short. The caller may be close to the function's
 * time limit, and being killed here is the exact thing this guards against.
 */
async function recordPublished(postId: string, instagramId: string | null): Promise<boolean> {
  const delaysMs = [0, 400, 1_200];

  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    if (delaysMs[attempt]) {
      await new Promise((r) => setTimeout(r, delaysMs[attempt]));
    }
    try {
      await prisma.instagramPost.update({
        where: { id: postId },
        data: {
          status: "posted",
          postedAt: new Date(),
          instagramId,
          postingStartedAt: null,
        },
      });
      return true;
    } catch (e) {
      console.error(
        `[instagram] recording publish of ${postId} failed (attempt ${attempt + 1}/${delaysMs.length}):`,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  return false;
}

/**
 * Publish one queued post to Instagram.
 *
 * Extracted from the Mon/Wed/Fri cron so the admin "Post now" button runs the
 * identical sequence. The duplicate-post guards — fingerprint check before
 * claiming, claim before anything irreversible, the container recorded before
 * publishing and reconciled by its status — only hold if there is exactly one
 * copy of them. Don't
 * reimplement this at a call site.
 *
 * Callers are responsible for the token health check and for confirming the
 * post is in a publishable state before calling.
 *
 * `source` affects alert wording only: a manual publisher is watching the
 * screen and gets the error back in the UI, a cron is not and needs the email.
 */
export async function publishQueuedPost(
  post: PublishablePost,
  source: "cron" | "manual" = "cron"
): Promise<PublishResult> {
  const label = post.productId ?? post.type;

  // Only production publishes. A preview deployment shares the admin, and a
  // public post can't be taken back; locally (no VERCEL_ENV) is allowed.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { outcome: "failed", error: `Publishing is disabled on ${process.env.VERCEL_ENV} deployments.`, leftPosting: false };
  }

  // A work can be hidden after its post was approved — taken down, or found to
  // be a duplicate listing (Autumn Canopy was the same photograph as Top of Blue
  // Mountain under a second name). Posting it anyway would advertise a work whose
  // page on the site now 404s, and a public post can't be taken back. So a post
  // whose work is hidden or gone is held exactly like a repainted one: back to
  // Pending Review, off the schedule. Checked first — a work that isn't listed
  // shouldn't post however its file looks — and before claiming, so a refusal
  // leaves nothing else changed. A post not tied to a work (no productId) passes.
  if (post.productId) {
    const work = await prisma.product.findUnique({
      where: { id: post.productId },
      select: { visible: true },
    });

    if (!work?.visible) {
      const gone = !work;
      await prisma.instagramPost.update({
        where: { id: post.id },
        data: { status: "pending", scheduledAt: null },
      });

      if (source === "cron") {
        await sendAlert(
          `Instagram post held back: the work is ${gone ? "no longer in the catalogue" : "hidden on the site"}`,
          [
            `"${label}" was due to post today, but the work is ${gone ? "no longer in the catalogue" : "hidden on the site"}, so its page there does not exist.`,
            "",
            "It was NOT published, and it has been moved back to Pending Review.",
            "",
            gone
              ? 'Open /admin/instagram and click "Skip" on it.'
              : 'If the work was hidden on purpose, open /admin/instagram and click "Skip" on it. If it should be listed, make it visible again in /admin, then approve the post again.',
          ].join("\n")
        );
      }

      return {
        outcome: "held",
        reason: gone
          ? "This post's work is no longer in the catalogue, so it was not published. It is back in Pending Review. Skip it."
          : "This post's work is hidden on the site, so it was not published. It is back in Pending Review. Skip it, or make the work visible again and re-approve.",
      };
    }
  }

  // A repaint replaces the file behind an unchanged URL, which silently
  // invalidates the caption — the post still looks fine in the admin. Checked
  // BEFORE claiming, so a refusal leaves the row exactly as it was.
  const currentFingerprint = await fetchMediaFingerprint(post.imageUrl);

  if (mediaHasChanged(post.mediaFingerprint, currentFingerprint)) {
    // Back to "pending": it leaves the schedule, surfaces in Pending Review,
    // and cannot publish until the caption is rewritten and re-approved.
    await prisma.instagramPost.update({
      where: { id: post.id },
      data: { status: "pending", scheduledAt: null },
    });

    if (source === "cron") {
      await sendAlert(
        "Instagram post held back: the artwork changed after the caption was written",
        [
          `"${label}" was due to post today, but the image behind it has been replaced since its caption was written.`,
          "",
          "That usually means the work was repainted. The caption may describe the old version (wrong subject, wrong sizes, wrong price), so it was NOT published.",
          "",
          'It has been moved back to Pending Review. Open /admin/instagram, click "Regenerate caption" on it, check the result, and approve it again.',
        ].join("\n")
      );
    }

    return {
      outcome: "held",
      reason:
        "The artwork behind this post has changed since its caption was written, so it was not published. It is back in Pending Review. Regenerate the caption, check it, then approve again.",
    };
  }

  // First time we've seen this row (queued before fingerprints existed, or the
  // HEAD failed at creation) — record a baseline now so the next repaint is
  // caught. Deliberately does not block: with nothing to compare against we
  // cannot tell a stale caption from a fresh one.
  if (!post.mediaFingerprint && currentFingerprint) {
    await prisma.instagramPost.update({
      where: { id: post.id },
      data: { mediaFingerprint: currentFingerprint },
    });
  }

  // Claim the post before doing anything irreversible. Flipping it out of
  // "approved" means neither a second click nor a later cron can pick it up —
  // so we never publish the same post twice. The claim matches only a post
  // that is still "approved": two runs that overlap (a cron delivered twice,
  // "Post now" while the cron runs) both read it as approved, and an update
  // by id alone let both claim it and both publish (security review, October
  // 2026). Now one wins and the other stops here. containerId is cleared:
  // this attempt makes its own container, and a stale one must not be
  // reconciled as if it were this attempt's.
  const claim = await prisma.instagramPost.updateMany({
    where: { id: post.id, status: "approved" },
    data: { status: "posting", postingStartedAt: new Date(), containerId: null },
  });
  if (claim.count !== 1) {
    return {
      outcome: "held",
      reason: "This post is no longer waiting to be published: another run has already claimed it, or it was changed.",
    };
  }

  // Step 1 — create the media container. Nothing is live yet, so on failure it
  // is safe to return the post to "approved" for a retry.
  const isReel = post.type === "reel" || isVideoUrl(post.imageUrl);

  let creationId: string;
  // The letterboxed copy, when one was made. Reels are never letterboxed — the
  // files are already 1080x1920 — so this stays null for them.
  let temporaryUrl: string | null = null;

  try {
    if (isReel) {
      creationId = await createReelContainer(post.imageUrl, post.caption);
    } else {
      const container = await createMediaContainer(post.imageUrl, post.caption);
      creationId = container.id;
      temporaryUrl = container.temporaryUrl;
    }
    // Recorded BEFORE publishing: the container is the idempotency key that
    // lets a failed or interrupted publish be reconciled with Meta later. If
    // this write fails, nothing has been published, so it fails like step 1.
    await prisma.instagramPost.update({
      where: { id: post.id },
      data: { containerId: creationId },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[instagram:${source}] container creation failed:`, msg);
    await discardPreparedImage(temporaryUrl);
    await prisma.instagramPost.update({
      where: { id: post.id },
      data: { status: "approved", containerId: null, postingStartedAt: null },
    });

    if (source === "cron") {
      await sendAlert(
        "Instagram post failed (will retry next run)",
        `Creating the media container failed for "${label}". The post was returned to the queue and will be retried on the next scheduled run. No action needed unless it keeps failing.\n\nDetail: ${msg}`
      );
    }

    return { outcome: "failed", error: msg, leftPosting: false };
  }

  // Step 2 — publish. A failure here is ambiguous (the post may already be
  // live), so instead of guessing, ask Meta what became of the container.
  try {
    const instagramId = await publishMediaContainer(creationId);
    await discardPreparedImage(temporaryUrl);
    return await finishPublished(post, label, instagramId, isReel);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[instagram:${source}] publish errored for post ${post.id}; reconciling with Meta:`, msg);

    const outcome = await reconcilePosting(
      { id: post.id, caption: post.caption, containerId: creationId, postingStartedAt: new Date() },
      { label, isReel }
    );
    await discardPreparedImage(temporaryUrl);
    if (outcome.result === "posted") return { outcome: "posted", instagramId: outcome.instagramId ?? "", isReel };
    if (outcome.result === "requeued") {
      return { outcome: "failed", error: `${msg} (Instagram confirms it was not published; it is back in the queue.)`, leftPosting: false };
    }

    // Meta couldn't say. The row keeps its containerId, and the next cron run
    // asks again; only if it still can't be told does it wait for a person.
    await sendAlert(
      "Instagram post may have failed: checking again on the next run",
      `Publishing "${label}" errored after its media container was created, and Instagram couldn't yet confirm whether it went live (${outcome.detail}). The post was left in "posting" with its container recorded; the next scheduled run checks the container again and records or requeues it. Nothing will be posted twice.\n\nDetail: ${msg}\n\nTo settle it now: /admin/instagram → Needs Review → "Check with Instagram".`
    );
    return { outcome: "failed", error: msg, leftPosting: true };
  }
}

/** Record a live post; if the database won't take it, say so plainly. */
async function finishPublished(
  post: { id: string },
  label: string,
  instagramId: string | null,
  isReel: boolean
): Promise<PublishResult> {
  // Live on Instagram from here on. If the database disagrees, the database
  // is the thing that's wrong — say so plainly rather than implying the post
  // might not have gone out.
  if (await recordPublished(post.id, instagramId)) {
    return { outcome: "posted", instagramId: instagramId ?? "", isReel };
  }
  await sendAlert(
    "Instagram post IS live but the database was not updated",
    [
      `"${label}" published successfully to Instagram${instagramId ? ` (media id ${instagramId})` : ""}, but writing that back to the database failed after three attempts.`,
      "",
      "The post is live. Nothing needs re-posting, and the next scheduled run records it from its container.",
    ].join("\n")
  );
  return {
    outcome: "failed",
    error: "Published to Instagram, but the queue could not be updated. The post IS live; the next run records it.",
    leftPosting: true,
  };
}

/** How long a claim may sit without a container before it is treated as dead. */
export const STALE_CLAIM_MS = 15 * 60_000;

export type ReconcileOutcome =
  | { result: "posted"; instagramId: string | null }
  | { result: "requeued" }
  | { result: "unknown"; detail: string };

/**
 * Settle a row in "posting" by asking Meta, never by guessing.
 *
 *   container PUBLISHED  → it went live: record it (media id found by caption)
 *   container FINISHED   → ready but never published; publishing it now cannot
 *                          duplicate anything (Meta publishes a container once)
 *   EXPIRED / ERROR      → it never went live: back to the queue
 *   IN_PROGRESS, or Meta unreachable → unknown; left for the next run
 *
 * A claim with no container that is older than STALE_CLAIM_MS died before
 * media_publish was ever called, so it is requeued. A row claimed before this
 * existed (no postingStartedAt) is looked up by caption: found means posted,
 * not found stays unknown for a person, since its attempt left no container.
 */
export async function reconcilePosting(
  row: { id: string; caption: string; containerId: string | null; postingStartedAt: Date | null },
  ctx: { label: string; isReel: boolean },
  now: Date = new Date()
): Promise<ReconcileOutcome> {
  const requeue = async (): Promise<ReconcileOutcome> => {
    await prisma.instagramPost.update({
      where: { id: row.id },
      data: { status: "approved", containerId: null, postingStartedAt: null },
    });
    return { result: "requeued" };
  };
  const posted = async (instagramId: string | null): Promise<ReconcileOutcome> => {
    const r = await finishPublished(row, ctx.label, instagramId, ctx.isReel);
    return r.outcome === "posted"
      ? { result: "posted", instagramId }
      : { result: "unknown", detail: "live, but the database write failed" };
  };

  try {
    if (!row.containerId) {
      if (row.postingStartedAt) {
        const age = now.getTime() - row.postingStartedAt.getTime();
        return age > STALE_CLAIM_MS ? await requeue() : { result: "unknown", detail: "claimed moments ago; may still be publishing" };
      }
      const id = await findPublishedMediaId(row.caption, null);
      return id ? await posted(id) : { result: "unknown", detail: "claimed before containers were recorded, and not found on the account" };
    }

    const status = await getContainerStatus(row.containerId);
    if (status === "PUBLISHED") {
      return await posted(await findPublishedMediaId(row.caption, row.postingStartedAt).catch(() => null));
    }
    if (status === "FINISHED") {
      return await posted(await publishMediaContainer(row.containerId));
    }
    if (status === "EXPIRED" || status === "ERROR") return await requeue();
    return { result: "unknown", detail: `container is ${status}` };
  } catch (e) {
    return { result: "unknown", detail: e instanceof Error ? e.message : String(e) };
  }
}

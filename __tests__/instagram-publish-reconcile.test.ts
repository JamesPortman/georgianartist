import { describe, it, expect, vi, beforeEach } from "vitest";

const findProduct = vi.hoisted(() => vi.fn());
const updatePost = vi.hoisted(() => vi.fn());
const sendAlert = vi.hoisted(() => vi.fn());
const createMediaContainer = vi.hoisted(() => vi.fn());
const publishMediaContainer = vi.hoisted(() => vi.fn());
const getContainerStatus = vi.hoisted(() => vi.fn());
const findPublishedMediaId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findUnique: findProduct },
    instagramPost: {
      update: updatePost,
      // The claim; recorded with the other writes, and it always wins here.
      updateMany: async (args: unknown) => {
        updatePost(args);
        return { count: 1 };
      },
    },
  },
}));
vi.mock("@/lib/notify", () => ({ sendAlert }));
vi.mock("@/lib/instagram", () => ({
  fetchMediaFingerprint: async () => "etag|1",
  mediaHasChanged: () => false,
  createMediaContainer,
  createReelContainer: vi.fn(),
  publishMediaContainer,
  getContainerStatus,
  findPublishedMediaId,
  discardPreparedImage: vi.fn(),
  isVideoUrl: () => false,
}));

import { publishQueuedPost, reconcilePosting, STALE_CLAIM_MS } from "@/lib/instagram-publish";

/**
 * A publish that errors after its media container exists used to be left in
 * "posting" for a person to check the account by hand. Meta publishes a
 * container at most once, so the container is an idempotency key: its status
 * says whether the attempt went live, and a ready-but-unpublished container
 * can be published without any risk of a second post.
 */
const post = {
  id: "post-1",
  type: "painting",
  productId: "lora-bay",
  imageUrl: "https://example.com/lora-bay.jpg",
  caption: "Lora Bay, at first light.",
  mediaFingerprint: "etag|1",
};
const ctx = { label: "lora-bay", isReel: false };
const dataOf = () => updatePost.mock.calls.map((c) => c[0].data);

beforeEach(() => {
  vi.clearAllMocks();
  findProduct.mockResolvedValue({ visible: true });
  updatePost.mockResolvedValue({});
  createMediaContainer.mockResolvedValue({ id: "container-9", temporaryUrl: null });
});

describe("publishing", () => {
  it("records the container before calling media_publish", async () => {
    publishMediaContainer.mockImplementation(async () => {
      expect(dataOf()).toContainEqual({ containerId: "container-9" });
      return "media-1";
    });
    const r = await publishQueuedPost(post, "cron");
    expect(r).toEqual({ outcome: "posted", instagramId: "media-1", isReel: false });
  });

  it("records a post that went live although media_publish errored", async () => {
    publishMediaContainer.mockRejectedValueOnce(new Error("socket hang up"));
    getContainerStatus.mockResolvedValue("PUBLISHED");
    findPublishedMediaId.mockResolvedValue("media-7");

    const r = await publishQueuedPost(post, "cron");
    expect(r).toEqual({ outcome: "posted", instagramId: "media-7", isReel: false });
    expect(publishMediaContainer).toHaveBeenCalledTimes(1); // never published twice
    expect(dataOf()).toContainEqual(expect.objectContaining({ status: "posted", instagramId: "media-7" }));
  });

  it("publishes a ready container that never went out, with the same container", async () => {
    publishMediaContainer.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce("media-8");
    getContainerStatus.mockResolvedValue("FINISHED");

    const r = await publishQueuedPost(post, "cron");
    expect(r.outcome).toBe("posted");
    expect(publishMediaContainer).toHaveBeenNthCalledWith(2, "container-9");
  });

  it("requeues when the container expired or failed, since nothing went live", async () => {
    publishMediaContainer.mockRejectedValueOnce(new Error("bad"));
    getContainerStatus.mockResolvedValue("ERROR");

    const r = await publishQueuedPost(post, "cron");
    expect(r).toMatchObject({ outcome: "failed", leftPosting: false });
    expect(dataOf()).toContainEqual({ status: "approved", containerId: null, postingStartedAt: null });
  });

  it("leaves the row in posting, container kept, when Meta can't say", async () => {
    publishMediaContainer.mockRejectedValueOnce(new Error("bad"));
    getContainerStatus.mockRejectedValue(new Error("Meta down"));

    const r = await publishQueuedPost(post, "cron");
    expect(r).toMatchObject({ outcome: "failed", leftPosting: true });
    expect(dataOf()).not.toContainEqual(expect.objectContaining({ status: "approved" }));
    expect(dataOf()).not.toContainEqual(expect.objectContaining({ containerId: null, status: "approved" }));
    expect(sendAlert).toHaveBeenCalledWith(expect.stringMatching(/checking again/), expect.any(String));
  });
});

describe("reconcilePosting, for a row a previous run left behind", () => {
  const now = new Date("2026-10-02T15:00:00Z");
  const row = (over = {}) => ({
    id: "post-1",
    caption: post.caption,
    containerId: null as string | null,
    postingStartedAt: null as Date | null,
    ...over,
  });

  it("requeues a claim that never got a container once it is stale", async () => {
    const r = await reconcilePosting(row({ postingStartedAt: new Date(now.getTime() - STALE_CLAIM_MS - 1) }), ctx, now);
    expect(r).toEqual({ result: "requeued" });
  });

  it("leaves a fresh claim alone; it may still be publishing", async () => {
    const r = await reconcilePosting(row({ postingStartedAt: new Date(now.getTime() - 60_000) }), ctx, now);
    expect(r.result).toBe("unknown");
    expect(updatePost).not.toHaveBeenCalled();
  });

  it("finds a pre-container row on the account by its caption", async () => {
    findPublishedMediaId.mockResolvedValue("media-3");
    expect(await reconcilePosting(row(), ctx, now)).toEqual({ result: "posted", instagramId: "media-3" });
  });

  it("leaves a pre-container row for a person when it isn't on the account", async () => {
    findPublishedMediaId.mockResolvedValue(null);
    expect((await reconcilePosting(row(), ctx, now)).result).toBe("unknown");
    expect(updatePost).not.toHaveBeenCalled();
  });

  it("waits on a container Meta is still processing", async () => {
    getContainerStatus.mockResolvedValue("IN_PROGRESS");
    const r = await reconcilePosting(row({ containerId: "c", postingStartedAt: now }), ctx, now);
    expect(r).toEqual({ result: "unknown", detail: "container is IN_PROGRESS" });
    expect(publishMediaContainer).not.toHaveBeenCalled();
  });
});

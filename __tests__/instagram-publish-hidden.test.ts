import { describe, it, expect, vi, beforeEach } from "vitest";

const findProduct = vi.hoisted(() => vi.fn());
const updatePost = vi.hoisted(() => vi.fn());
const sendAlert = vi.hoisted(() => vi.fn());
const fetchMediaFingerprint = vi.hoisted(() => vi.fn());
const mediaHasChanged = vi.hoisted(() => vi.fn());
const createMediaContainer = vi.hoisted(() => vi.fn());
const createReelContainer = vi.hoisted(() => vi.fn());
const publishMediaContainer = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findUnique: findProduct },
    instagramPost: { update: updatePost, updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/notify", () => ({ sendAlert }));
vi.mock("@/lib/instagram", () => ({
  fetchMediaFingerprint,
  mediaHasChanged,
  createMediaContainer,
  createReelContainer,
  publishMediaContainer,
  discardPreparedImage: vi.fn(),
  isVideoUrl: () => false,
}));

import { publishQueuedPost, type PublishablePost } from "@/lib/instagram-publish";

/**
 * A work can be hidden after its post was approved. Autumn Canopy was: it
 * turned out to be the same photograph as Top of Blue Mountain under a second
 * name. The cron published any approved post without looking, so a hidden work
 * would still have gone out on its day, advertising a page that 404s, and a
 * public post can't be taken back. These pin the hold.
 */
const post = (over: Partial<PublishablePost> = {}): PublishablePost => ({
  id: "post-1",
  type: "painting",
  productId: "autumn-canopy",
  imageUrl: "https://example.com/autumn-canopy.jpg",
  caption: "…",
  mediaFingerprint: "etag|123",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchMediaFingerprint.mockResolvedValue("etag|123");
  mediaHasChanged.mockReturnValue(false);
});

describe("publishQueuedPost: a work that is no longer listed", () => {
  it("holds the post for a hidden work, and publishes nothing", async () => {
    findProduct.mockResolvedValue({ visible: false });
    const result = await publishQueuedPost(post(), "cron");

    expect(result.outcome).toBe("held");
    expect(result.outcome === "held" && result.reason).toMatch(/hidden on the site/);
    // back to Pending Review, off the schedule, exactly like a repainted work
    expect(updatePost).toHaveBeenCalledWith({
      where: { id: "post-1" },
      data: { status: "pending", scheduledAt: null },
    });
    // nothing irreversible was started, and the file was not even fetched
    expect(createMediaContainer).not.toHaveBeenCalled();
    expect(publishMediaContainer).not.toHaveBeenCalled();
    expect(fetchMediaFingerprint).not.toHaveBeenCalled();
  });

  it("holds the post for a work deleted from the catalogue", async () => {
    findProduct.mockResolvedValue(null);
    const result = await publishQueuedPost(post(), "cron");
    expect(result.outcome === "held" && result.reason).toMatch(/no longer in the catalogue/);
    expect(publishMediaContainer).not.toHaveBeenCalled();
  });

  it("emails from the cron, because nobody is watching when it runs", async () => {
    findProduct.mockResolvedValue({ visible: false });
    await publishQueuedPost(post(), "cron");
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0]![0]).toMatch(/held back.*hidden/);
    expect(sendAlert.mock.calls[0]![1]).toMatch(/autumn-canopy/);
  });

  it("does not email from Post now: the reason goes back to the screen instead", async () => {
    findProduct.mockResolvedValue({ visible: false });
    const result = await publishQueuedPost(post(), "manual");
    expect(result.outcome).toBe("held");
    expect(sendAlert).not.toHaveBeenCalled();
  });
});

describe("publishQueuedPost: posts the check must not block", () => {
  it("lets a visible work through to the next check", async () => {
    findProduct.mockResolvedValue({ visible: true });
    // stop at the repaint check, which proves the visibility check was passed
    mediaHasChanged.mockReturnValue(true);
    const result = await publishQueuedPost(post(), "manual");
    expect(fetchMediaFingerprint).toHaveBeenCalled();
    expect(result.outcome === "held" && result.reason).toMatch(/changed since its caption/);
  });

  it("does not look up a work for a post that isn't tied to one", async () => {
    mediaHasChanged.mockReturnValue(true);
    await publishQueuedPost(post({ productId: null }), "manual");
    expect(findProduct).not.toHaveBeenCalled();
    expect(fetchMediaFingerprint).toHaveBeenCalled();
  });
});

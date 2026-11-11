import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The whole publish sequence (lib/instagram-publish.ts), write by write.
 *
 * The other publish tests pin single scenarios. Mutation testing found that
 * with them, deleting the production-only guard, emptying the claim or the
 * requeue, sending a reel through the image path, skipping the retries that
 * record a live post, or emailing from the wrong caller all passed. So the fake
 * database here records each write in full (which post, what data), the clock
 * is faked so the retry waits are exact, and every alert is checked for who
 * gets it and the facts it must state.
 */

type Write = { where: { id: string }; data: Record<string, unknown> };

const state = vi.hoisted(() => ({
  writes: [] as Write[],
  product: { visible: true } as { visible: boolean } | null,
  productQueries: [] as unknown[],
  /** How many "posted" writes fail before one succeeds. */
  postedFailures: 0,
  alerts: [] as { subject: string; body: string }[],
  /** Whether the post is still "approved" when the claim runs. */
  claimable: true,
}));

const ig = vi.hoisted(() => ({
  fetchMediaFingerprint: vi.fn(),
  mediaHasChanged: vi.fn(),
  createMediaContainer: vi.fn(),
  createReelContainer: vi.fn(),
  publishMediaContainer: vi.fn(),
  getContainerStatus: vi.fn(),
  findPublishedMediaId: vi.fn(),
  discardPreparedImage: vi.fn(),
  isVideoUrl: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findUnique: async (args: unknown) => {
        state.productQueries.push(args);
        return state.product;
      },
    },
    instagramPost: {
      updateMany: async (args: Write) => {
        state.writes.push(args);
        return { count: state.claimable ? 1 : 0 };
      },
      update: async (args: Write) => {
        if (args.data.status === "posted" && state.postedFailures > 0) {
          state.postedFailures--;
          state.writes.push({ ...args, data: { ...args.data, failed: true } });
          throw new Error("Neon cold start");
        }
        state.writes.push(args);
        return {};
      },
    },
  },
}));
vi.mock("@/lib/notify", () => ({
  sendAlert: async (subject: string, body: string) => void state.alerts.push({ subject, body }),
}));
vi.mock("@/lib/instagram", () => ig);

const { publishQueuedPost, reconcilePosting, STALE_CLAIM_MS } = await import("../lib/instagram-publish");
type Post = Parameters<typeof publishQueuedPost>[0];

const NOW = new Date("2026-10-07T13:00:00.000Z");
const post = (over: Partial<Post> = {}): Post => ({
  id: "post-1",
  type: "painting",
  productId: "lora-bay",
  imageUrl: "https://example.com/lora-bay.jpg",
  caption: "Lora Bay, at first light.",
  mediaFingerprint: "etag|1",
  ...over,
});
/** Run a call to the end, letting its retry waits pass on the fake clock. */
async function settle<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}
const statuses = () => state.writes.map((w) => w.data.status).filter(Boolean);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.writes = [];
  state.product = { visible: true };
  state.productQueries = [];
  state.postedFailures = 0;
  state.alerts = [];
  state.claimable = true;
  ig.fetchMediaFingerprint.mockResolvedValue("etag|1");
  ig.mediaHasChanged.mockReturnValue(false);
  ig.createMediaContainer.mockResolvedValue({ id: "container-9", temporaryUrl: "https://blob/tmp-1.jpg" });
  ig.createReelContainer.mockResolvedValue("reel-container-3");
  ig.publishMediaContainer.mockResolvedValue("media-1");
  ig.isVideoUrl.mockReturnValue(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ── Only production publishes ────────────────────────────────────────────────

describe("only production publishes", () => {
  it.each(["preview", "development"])("refuses on a %s deployment, touching nothing", async (env) => {
    vi.stubEnv("VERCEL_ENV", env);
    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({
      outcome: "failed",
      error: `Publishing is disabled on ${env} deployments.`,
      leftPosting: false,
    });
    expect(state.writes).toEqual([]);
    expect(state.productQueries).toEqual([]);
    expect(ig.createMediaContainer).not.toHaveBeenCalled();
    expect(ig.publishMediaContainer).not.toHaveBeenCalled();
  });

  it.each([
    ["production", "production"],
    ["a laptop (no VERCEL_ENV)", ""],
  ])("publishes on %s", async (_, env) => {
    vi.stubEnv("VERCEL_ENV", env);
    expect((await settle(publishQueuedPost(post(), "manual"))).outcome).toBe("posted");
  });
});

// ── Before claiming ──────────────────────────────────────────────────────────

describe("before the post is claimed", () => {
  it("asks only whether this post's work is visible", async () => {
    await settle(publishQueuedPost(post(), "manual"));
    expect(state.productQueries).toEqual([{ where: { id: "lora-bay" }, select: { visible: true } }]);
  });

  it("skips the work check for a post tied to no work", async () => {
    await settle(publishQueuedPost(post({ productId: null, type: "studio" }), "manual"));
    expect(state.productQueries).toEqual([]);
  });

  it.each([
    [
      "hidden",
      { visible: false },
      "Instagram post held back: the work is hidden on the site",
      'If the work was hidden on purpose, open /admin/instagram and click "Skip" on it.',
    ],
    [
      "gone",
      null,
      "Instagram post held back: the work is no longer in the catalogue",
      'Open /admin/instagram and click "Skip" on it.',
    ],
  ])("emails from the cron by default when the work is %s, saying it was not published", async (_, product, subject, action) => {
    state.product = product;
    await settle(publishQueuedPost(post()));
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]!.subject).toBe(subject);
    const lines = state.alerts[0]!.body.split("\n");
    const why = product ? "hidden on the site" : "no longer in the catalogue";
    expect(lines[0]).toBe(`"lora-bay" was due to post today, but the work is ${why}, so its page there does not exist.`);
    expect(lines).toEqual([
      lines[0],
      "",
      "It was NOT published, and it has been moved back to Pending Review.",
      "",
      expect.stringContaining(action),
    ]);
  });

  it("holds a repainted work: back to Pending Review, emailed from the cron only", async () => {
    ig.fetchMediaFingerprint.mockResolvedValue("etag|2");
    ig.mediaHasChanged.mockReturnValue(true);

    const r = await settle(publishQueuedPost(post(), "cron"));
    expect(r.outcome).toBe("held");
    expect(r.outcome === "held" && r.reason).toMatch(/changed since its caption was written/);
    expect(state.writes).toEqual([{ where: { id: "post-1" }, data: { status: "pending", scheduledAt: null } }]);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]!.subject).toBe("Instagram post held back: the artwork changed after the caption was written");
    const lines = state.alerts[0]!.body.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('"lora-bay" was due to post today, but the image behind it has been replaced since its caption was written.');
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^That usually means the work was repainted\..*so it was NOT published\.$/);
    expect(lines[3]).toBe("");
    expect(lines[4]).toMatch(/^It has been moved back to Pending Review\. .*"Regenerate caption"/);

    state.alerts = [];
    await settle(publishQueuedPost(post(), "manual"));
    expect(state.alerts).toEqual([]); // Post now shows the reason on screen instead
    expect(ig.createMediaContainer).not.toHaveBeenCalled();
  });

  it("records a first fingerprint for a post that had none, and only then", async () => {
    ig.fetchMediaFingerprint.mockResolvedValue("etag|9");
    await settle(publishQueuedPost(post({ mediaFingerprint: null }), "manual"));
    expect(state.writes[0]).toEqual({ where: { id: "post-1" }, data: { mediaFingerprint: "etag|9" } });

    for (const [stored, current] of [
      ["etag|1", "etag|1"],
      [null, null],
    ]) {
      state.writes = [];
      ig.fetchMediaFingerprint.mockResolvedValue(current);
      await settle(publishQueuedPost(post({ mediaFingerprint: stored }), "manual"));
      expect(state.writes.some((w) => "mediaFingerprint" in w.data)).toBe(false);
    }
  });
});

// ── Claim, container, publish ────────────────────────────────────────────────

describe("claiming and publishing", () => {
  it("publishes nothing when another run claimed the post first", async () => {
    state.claimable = false;
    const result = await settle(publishQueuedPost(post(), "cron"));
    expect(result).toMatchObject({ outcome: "held" });
    expect(ig.createMediaContainer).not.toHaveBeenCalled();
    expect(ig.createReelContainer).not.toHaveBeenCalled();
    expect(ig.publishMediaContainer).not.toHaveBeenCalled();
    expect(state.writes).toEqual([
      { where: { id: "post-1", status: "approved" }, data: { status: "posting", postingStartedAt: NOW, containerId: null } },
    ]);
  });

  it("claims the post, records its container, publishes, then records the post: in that order", async () => {
    ig.createMediaContainer.mockImplementation(async () => {
      expect(state.writes).toEqual([
        { where: { id: "post-1", status: "approved" }, data: { status: "posting", postingStartedAt: NOW, containerId: null } },
      ]);
      return { id: "container-9", temporaryUrl: "https://blob/tmp-1.jpg" };
    });
    ig.publishMediaContainer.mockImplementation(async () => {
      expect(state.writes.at(-1)).toEqual({ where: { id: "post-1" }, data: { containerId: "container-9" } });
      return "media-1";
    });

    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({
      outcome: "posted",
      instagramId: "media-1",
      isReel: false,
    });
    expect(ig.createMediaContainer).toHaveBeenCalledWith("https://example.com/lora-bay.jpg", "Lora Bay, at first light.");
    expect(ig.publishMediaContainer).toHaveBeenCalledWith("container-9");
    expect(ig.discardPreparedImage).toHaveBeenCalledWith("https://blob/tmp-1.jpg");
    expect(state.writes.at(-1)).toEqual({
      where: { id: "post-1" },
      data: { status: "posted", postedAt: NOW, instagramId: "media-1", postingStartedAt: null },
    });
  });

  it.each([
    ["a reel", { type: "reel" }, false],
    ["a video file, whatever its type", { type: "painting" }, true],
  ])("sends %s as a reel, never through the image path", async (_, over, isVideo) => {
    ig.isVideoUrl.mockReturnValue(isVideo);
    const r = await settle(publishQueuedPost(post(over), "manual"));
    expect(r).toEqual({ outcome: "posted", instagramId: "media-1", isReel: true });
    expect(ig.createReelContainer).toHaveBeenCalledWith("https://example.com/lora-bay.jpg", "Lora Bay, at first light.");
    expect(ig.createMediaContainer).not.toHaveBeenCalled();
    expect(ig.publishMediaContainer).toHaveBeenCalledWith("reel-container-3");
    expect(ig.discardPreparedImage).toHaveBeenCalledWith(null); // reels make no letterboxed copy
  });

  it("sends an ordinary image through the image path", async () => {
    await settle(publishQueuedPost(post(), "manual"));
    expect(ig.createReelContainer).not.toHaveBeenCalled();
  });
});

// ── Container failures: safe to retry ────────────────────────────────────────

describe("when the container can't be made", () => {
  beforeEach(() => {
    ig.createMediaContainer.mockRejectedValue(new Error("image too large"));
  });

  it("returns the post to the queue and discards nothing it didn't make", async () => {
    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({
      outcome: "failed",
      error: "image too large",
      leftPosting: false,
    });
    expect(state.writes.at(-1)).toEqual({
      where: { id: "post-1" },
      data: { status: "approved", containerId: null, postingStartedAt: null },
    });
    expect(ig.publishMediaContainer).not.toHaveBeenCalled();
    expect(state.alerts).toEqual([]); // Post now: the error is on screen
  });

  it("emails from the cron that it will retry", async () => {
    await settle(publishQueuedPost(post(), "cron"));
    expect(state.alerts).toEqual([
      {
        subject: "Instagram post failed (will retry next run)",
        body: expect.stringMatching(/^Creating the media container failed for "lora-bay"\. [\s\S]*Detail: image too large$/),
      },
    ]);
  });
});

// ── Publish errors: ask Meta, never guess ────────────────────────────────────

describe("when media_publish errors", () => {
  beforeEach(() => {
    ig.publishMediaContainer.mockRejectedValueOnce(new Error("socket hang up"));
  });

  it.each(["EXPIRED", "ERROR"])("requeues a container Meta reports %s, and says so", async (status) => {
    ig.getContainerStatus.mockResolvedValue(status);
    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({
      outcome: "failed",
      error: "socket hang up (Instagram confirms it was not published; it is back in the queue.)",
      leftPosting: false,
    });
    expect(state.writes.at(-1)).toEqual({
      where: { id: "post-1" },
      data: { status: "approved", containerId: null, postingStartedAt: null },
    });
  });

  it("records a post Meta says went live, even when its media id can't be found", async () => {
    ig.getContainerStatus.mockResolvedValue("PUBLISHED");
    ig.findPublishedMediaId.mockRejectedValue(new Error("rate limited"));
    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({ outcome: "posted", instagramId: "", isReel: false });
    expect(state.writes.at(-1)?.data).toMatchObject({ status: "posted", instagramId: null });
    expect(ig.publishMediaContainer).toHaveBeenCalledTimes(1);
  });

  it("leaves an undecided post in posting, and emails whoever called, since it may be live", async () => {
    ig.getContainerStatus.mockResolvedValue("IN_PROGRESS");
    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({
      outcome: "failed",
      error: "socket hang up",
      leftPosting: true,
    });
    expect(statuses()).toEqual(["posting"]);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0]!.subject).toBe("Instagram post may have failed: checking again on the next run");
    expect(state.alerts[0]!.body).toMatch(/^Publishing "lora-bay" errored [\s\S]*\(container is IN_PROGRESS\)\.[\s\S]*Nothing will be posted twice\./);
  });
});

// ── Recording a live post ────────────────────────────────────────────────────

describe("recording a post that is live", () => {
  it("retries the write twice, waiting 0.4 s then 1.2 s, and succeeds on the third", async () => {
    state.postedFailures = 2;
    const p = publishQueuedPost(post(), "manual");
    const attempts = () => state.writes.filter((w) => w.data.status === "posted").length;

    await vi.advanceTimersByTimeAsync(0);
    expect(attempts()).toBe(1);
    await vi.advanceTimersByTimeAsync(399);
    expect(attempts()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts()).toBe(2);
    await vi.advanceTimersByTimeAsync(1_199);
    expect(attempts()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts()).toBe(3);

    expect(await p).toEqual({ outcome: "posted", instagramId: "media-1", isReel: false });
    expect(state.alerts).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      "[instagram] recording publish of post-1 failed (attempt 1/3):",
      "Neon cold start"
    );
  });

  it("after three failed writes, says plainly that the post IS live", async () => {
    state.postedFailures = 3;
    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({
      outcome: "failed",
      error: "Published to Instagram, but the queue could not be updated. The post IS live; the next run records it.",
      leftPosting: true,
    });
    expect(state.writes.filter((w) => w.data.status === "posted")).toHaveLength(3);
    expect(state.alerts).toEqual([
      {
        subject: "Instagram post IS live but the database was not updated",
        body: [
          '"lora-bay" published successfully to Instagram (media id media-1), but writing that back to the database failed after three attempts.',
          "",
          "The post is live. Nothing needs re-posting, and the next scheduled run records it from its container.",
        ].join("\n"),
      },
    ]);
  });

  it("reports a live post with no media id as an empty id, not a made-up one", async () => {
    ig.publishMediaContainer.mockResolvedValue(null);
    expect(await settle(publishQueuedPost(post(), "manual"))).toEqual({ outcome: "posted", instagramId: "", isReel: false });
  });

  it("names the work in the alert when a post that errored turns out live but can't be recorded", async () => {
    ig.publishMediaContainer.mockRejectedValueOnce(new Error("socket hang up"));
    ig.getContainerStatus.mockResolvedValue("PUBLISHED");
    ig.findPublishedMediaId.mockResolvedValue("media-7");
    state.postedFailures = 3;
    await settle(publishQueuedPost(post(), "manual"));
    expect(state.alerts[0]!.body).toMatch(/^"lora-bay" published successfully to Instagram \(media id media-7\)/);
  });

  it("leaves the media id out of that alert when there isn't one", async () => {
    ig.publishMediaContainer.mockResolvedValue(null);
    state.postedFailures = 3;
    await settle(publishQueuedPost(post(), "manual"));
    expect(state.alerts[0]!.body.split("\n")[0]).toBe(
      '"lora-bay" published successfully to Instagram, but writing that back to the database failed after three attempts.'
    );
  });
});

// ── Settling a post left in "posting" ────────────────────────────────────────

describe("reconcilePosting", () => {
  const ctx = { label: "lora-bay", isReel: false };
  const row = (over = {}) => ({
    id: "post-1",
    caption: "Lora Bay, at first light.",
    containerId: null as string | null,
    postingStartedAt: null as Date | null,
    ...over,
  });

  it("requeues a claim with no container only once it is older than 15 minutes", async () => {
    const at = (ms: number) => row({ postingStartedAt: new Date(NOW.getTime() - ms) });
    expect(await settle(reconcilePosting(at(STALE_CLAIM_MS), ctx, NOW))).toEqual({
      result: "unknown",
      detail: "claimed moments ago; may still be publishing",
    });
    expect(state.writes).toEqual([]);
    expect(await settle(reconcilePosting(at(STALE_CLAIM_MS + 1), ctx, NOW))).toEqual({ result: "requeued" });
    expect(state.writes).toEqual([
      { where: { id: "post-1" }, data: { status: "approved", containerId: null, postingStartedAt: null } },
    ]);
  });

  it("looks up an old claim with no container by its caption", async () => {
    ig.findPublishedMediaId.mockResolvedValue(null);
    expect(await settle(reconcilePosting(row(), ctx, NOW))).toEqual({
      result: "unknown",
      detail: "claimed before containers were recorded, and not found on the account",
    });
    ig.findPublishedMediaId.mockResolvedValue("media-4");
    expect(await settle(reconcilePosting(row(), ctx, NOW))).toEqual({ result: "posted", instagramId: "media-4" });
    expect(ig.findPublishedMediaId).toHaveBeenCalledWith("Lora Bay, at first light.", null);
  });

  it("searches from the claim time for a published container", async () => {
    const started = new Date(NOW.getTime() - 60_000);
    ig.getContainerStatus.mockResolvedValue("PUBLISHED");
    ig.findPublishedMediaId.mockResolvedValue("media-5");
    expect(await settle(reconcilePosting(row({ containerId: "c-1", postingStartedAt: started }), ctx, NOW))).toEqual({
      result: "posted",
      instagramId: "media-5",
    });
    expect(ig.findPublishedMediaId).toHaveBeenCalledWith("Lora Bay, at first light.", started);
  });

  it("reports unknown, not posted, when the post is live but can't be recorded", async () => {
    ig.getContainerStatus.mockResolvedValue("FINISHED");
    ig.publishMediaContainer.mockResolvedValue("media-6");
    state.postedFailures = 3;
    expect(await settle(reconcilePosting(row({ containerId: "c-1" }), ctx, NOW))).toEqual({
      result: "unknown",
      detail: "live, but the database write failed",
    });
  });

  it.each([
    ["an Error", new Error("Meta unreachable"), "Meta unreachable"],
    ["anything else", "502", "502"],
  ])("reports unknown with the reason when asking Meta throws %s", async (_, thrown, detail) => {
    ig.getContainerStatus.mockRejectedValue(thrown);
    expect(await settle(reconcilePosting(row({ containerId: "c-1" }), ctx, NOW))).toEqual({ result: "unknown", detail });
  });
});

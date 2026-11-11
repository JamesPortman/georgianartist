"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { QueuePost } from "@/app/actions/instagram";
import { isVideoUrl } from "@/lib/media";
import { siteConfig } from "@/data/siteConfig";
import {
  approvePostAction,
  skipPostAction,
  unapprovePostAction,
  updateCaptionAction,
  regenerateCaptionAction,
  generatePostsAction,
  createVotingPostAction,
  publishNowAction,
  returnToQueueAction,
  markAsPostedAction,
  checkWithInstagramAction,
} from "@/app/actions/instagram";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return "not set";
  return new Date(iso).toLocaleDateString("en-CA", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function typeChip(type: QueuePost["type"]) {
  const map: Record<QueuePost["type"], string> = {
    painting: "bg-green-100 text-green-800",
    photograph: "bg-blue-100 text-blue-800",
    voting: "bg-purple-100 text-purple-800",
    press: "bg-amber-100 text-amber-800",
    reel: "bg-rose-100 text-rose-800",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[type]}`}>
      {type}
    </span>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onRefresh,
}: {
  post: QueuePost;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Separate from `busy`, which every action on the card shares — otherwise
  // unapproving a post would label its own button "Posting…".
  const [publishing, setPublishing] = useState(false);

  const isPending  = post.status === "pending";
  const isApproved = post.status === "approved";
  const isPosting  = post.status === "posting";

  function run(action: () => Promise<{ error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else {
        onRefresh();
      }
    });
  }

  async function saveCaption() {
    run(async () => {
      const r = await updateCaptionAction(post.id, caption);
      if (!r.error) setEditing(false);
      return r;
    });
  }

  function publishNow() {
    const when = post.scheduledAt ? fmtDate(post.scheduledAt) : "its scheduled slot";
    if (
      !confirm(
        `Publish this to Instagram now, instead of waiting for ${when}?\n\n` +
          `It goes out to the live account immediately and can't be undone from here.`
      )
    ) {
      return;
    }
    setPublishing(true);
    run(async () => {
      try {
        return await publishNowAction(post.id);
      } finally {
        setPublishing(false);
      }
    });
  }

  return (
    <div
      data-post-id={post.id}
      data-status={post.status}
      className={`rounded-lg border p-4 flex gap-4 ${busy ? "opacity-70" : ""} ${
        isPosting ? "bg-amber-50 border-amber-300" : "bg-white"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-24 h-24 flex-shrink-0 rounded overflow-hidden bg-gray-100">
        {isVideoUrl(post.imageUrl) ? (
          // Reels are video — <Image> would render a broken thumbnail. muted +
          // playsInline so it previews in place without hijacking the page.
          <video
            src={post.imageUrl}
            className="absolute inset-0 w-full h-full object-cover"
            muted
            loop
            playsInline
            preload="metadata"
            onMouseOver={(e) => void e.currentTarget.play()}
            onMouseOut={(e) => e.currentTarget.pause()}
          />
        ) : (
          <Image
            src={post.imageUrl}
            alt=""
            fill
            sizes="96px"
            className="object-cover"
            unoptimized={post.imageUrl.startsWith("http")}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {typeChip(post.type)}
          {isApproved && (
            <span className="text-xs text-gray-500">
              Scheduled: <strong>{fmtDate(post.scheduledAt)}</strong>
            </span>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            <textarea
              className="w-full text-sm border rounded p-2 resize-y min-h-[120px] font-mono"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={saveCaption}
                disabled={busy}
                className="text-xs bg-brand text-white px-3 py-1 rounded hover:bg-brand-hover disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => { setCaption(post.caption); setEditing(false); }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{post.caption}</p>
        )}

        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}

        {/* Actions */}
        {!editing && (
          <div className="flex flex-wrap gap-2 mt-3">
            {isPending && (
              <>
                <button
                  onClick={() => run(() => approvePostAction(post.id))}
                  disabled={busy}
                  className="text-xs bg-brand text-white px-3 py-1 rounded hover:bg-brand-hover disabled:opacity-50"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
                >
                  Edit caption
                </button>
                {post.productId && (
                  <button
                    onClick={() => run(() => regenerateCaptionAction(post.id))}
                    disabled={busy}
                    className="text-xs border border-gray-300 px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    ↻ Regenerate
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm("Skip this post? It won't be queued again.")) {
                      run(() => skipPostAction(post.id));
                    }
                  }}
                  disabled={busy}
                  className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
                >
                  Skip
                </button>
              </>
            )}
            {isApproved && (
              <>
                <button
                  onClick={publishNow}
                  disabled={busy}
                  title="Publishes to the live account immediately. A reel can take up to a minute while Meta transcodes it."
                  className="text-xs bg-brand text-white px-3 py-1 rounded hover:bg-brand-hover disabled:opacity-50"
                >
                  {publishing ? "Posting…" : "⚡ Post now"}
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
                >
                  Edit caption
                </button>
                <button
                  onClick={() => run(() => unapprovePostAction(post.id))}
                  disabled={busy}
                  className="text-xs text-gray-400 hover:text-orange-500 disabled:opacity-50"
                >
                  ↩ Unapprove
                </button>
              </>
            )}
            {isPosting && (
              <>
                <button
                  onClick={() => run(() => checkWithInstagramAction(post.id))}
                  disabled={busy}
                  className="text-xs bg-amber-600 text-white px-3 py-1 rounded hover:bg-amber-700 disabled:opacity-50"
                >
                  Check with Instagram
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Only if you have checked @${siteConfig.social.instagram} and this post is NOT there.\n\n` +
                          "It goes back in the queue and the cron will publish it. If it IS live, this posts it twice."
                      )
                    ) {
                      run(() => returnToQueueAction(post.id));
                    }
                  }}
                  disabled={busy}
                  className="text-xs border border-amber-400 text-amber-800 px-3 py-1 rounded hover:bg-amber-100 disabled:opacity-50"
                >
                  Not on Instagram: requeue it
                </button>
                <button
                  onClick={() => {
                    if (confirm("Mark as posted? Use this when the post IS live on Instagram.")) {
                      run(() => markAsPostedAction(post.id));
                    }
                  }}
                  disabled={busy}
                  className="text-xs border border-amber-400 text-amber-800 px-3 py-1 rounded hover:bg-amber-100 disabled:opacity-50"
                >
                  It&apos;s live: mark as posted
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Voting post form ──────────────────────────────────────────────────────────

function VotingPostForm({ onRefresh }: { onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await createVotingPostAction(fd);
      if (r.error) {
        setError(r.error);
      } else {
        setOpen(false);
        onRefresh();
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm border border-dashed border-gray-300 rounded-lg px-4 py-3 w-full text-gray-500 hover:border-brand hover:text-brand transition-colors"
      >
        {'+ Create "vote on my next subject" post'}
      </button>
    );
  }

  return (
    <form method="post" onSubmit={submit} className="bg-white rounded-lg border p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-800">New voting post</h3>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Question / topic</label>
        <input
          name="topic"
          required
          placeholder="e.g. Should I paint Collingwood or Meaford next?"
          className="w-full text-sm border rounded px-3 py-2"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Option A (comment 1)</label>
          <input name="optionA" required placeholder="Collingwood" className="w-full text-sm border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Option B (comment 2)</label>
          <input name="optionB" required placeholder="Meaford" className="w-full text-sm border rounded px-3 py-2" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Image URL (must be publicly accessible)</label>
        <input
          name="imageUrl"
          required
          type="url"
          placeholder="https://..."
          className="w-full text-sm border rounded px-3 py-2"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="text-xs bg-brand text-white px-4 py-1.5 rounded hover:bg-brand-hover disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate caption"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function InstagramQueueClient({
  queue,
  posted,
  needsReview,
}: {
  queue: QueuePost[];
  posted: QueuePost[];
  needsReview: QueuePost[];
}) {
  const router   = useRouter();
  const [busy, startTransition] = useTransition();
  const [genMsg, setGenMsg]     = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  function generatePosts() {
    setGenMsg(null);
    startTransition(async () => {
      const r = await generatePostsAction(6);
      setGenMsg(
        r.error
          ? `Added ${r.added} posts (with errors: ${r.error})`
          : `Added ${r.added} posts to the queue.`
      );
      router.refresh();
    });
  }

  const pending  = queue.filter((p) => p.status === "pending");
  const approved = queue.filter((p) => p.status === "approved");

  return (
    <div className="space-y-10">
      {/* Page title + generate button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Instagram Queue</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Review AI-generated captions, approve posts, and let the cron handle the rest.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generatePosts}
            disabled={busy}
            className="text-sm bg-brand text-white px-4 py-2 rounded hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate posts"}
          </button>
        </div>
      </div>

      {genMsg && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-2">
          {genMsg}
        </p>
      )}

      {/* Needs review — stranded mid-publish. First on the page: until one of
          these is resolved it is sitting outside both the queue and the
          history, and may or may not be live on the account. */}
      {needsReview.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-amber-800 uppercase tracking-wide mb-1">
            Needs Review ({needsReview.length})
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Publishing errored partway through, so these were not retried. A duplicate public
            post can&apos;t be undone. Check{" "}
            <a
              href={`https://www.instagram.com/${siteConfig.social.instagram}/`}
              target="_blank"
              rel="noreferrer"
              className="text-brand underline"
            >
              the account
            </a>{" "}
            first, then say which happened.
          </p>
          <div className="space-y-3">
            {needsReview.map((post) => (
              <PostCard key={post.id} post={post} onRefresh={refresh} />
            ))}
          </div>
        </section>
      )}

      {/* Voting post form */}
      <VotingPostForm onRefresh={refresh} />

      {/* Approved / scheduled */}
      {approved.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Approved & Scheduled ({approved.length})
          </h3>
          <div className="space-y-3">
            {approved.map((post) => (
              <PostCard key={post.id} post={post} onRefresh={refresh} />
            ))}
          </div>
        </section>
      )}

      {/* Pending review */}
      {pending.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Pending Review ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map((post) => (
              <PostCard key={post.id} post={post} onRefresh={refresh} />
            ))}
          </div>
        </section>
      ) : (
        <section>
          <div className="text-center py-12 text-gray-400">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm">{'Queue is empty. Click "Generate posts" to fill it up.'}</p>
          </div>
        </section>
      )}

      {/* Posted history */}
      {posted.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Recently Posted
          </h3>
          <div className="space-y-2">
            {posted.map((post) => (
              <div key={post.id} className="bg-white rounded-lg border px-4 py-3 flex items-center gap-3">
                <div className="relative w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
                  {isVideoUrl(post.imageUrl) ? (
                    <video
                      src={post.imageUrl}
                      className="absolute inset-0 w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <Image
                      src={post.imageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                      unoptimized={post.imageUrl.startsWith("http")}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{post.caption.slice(0, 80)}…</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {typeChip(post.type)}
                  <p className="text-xs text-gray-400 mt-1">{fmtDate(post.postedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

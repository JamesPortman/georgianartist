import { NextResponse } from "next/server";
import { put, list, del } from "@vercel/blob";
import { prisma } from "@/lib/db";
import { sendAlert } from "@/lib/notify";
import { buildSnapshot } from "@/lib/backup";
import { privateBlobToken } from "@/lib/private-blob";
import { isCronRequest } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * How long snapshots are kept.
 *
 * Deliberately not one copy. Pruning everything but the newest would leave a
 * single snapshot, so a bad one — an empty catalogue, a half-finished
 * migration — would replace the last good one with nothing to fall back to. A
 * week is enough to notice and recover, and still bounded: the folder had
 * grown to 94 files because nothing ever removed them.
 */
const RETENTION_DAYS = 7;

/**
 * Catalogue backup (Vercel Cron, every six hours — see vercel.json).
 *
 * Every six hours because Neon's Free plan keeps six hours of point-in-time
 * history: past that, a snapshot is the only way back, and a daily one could
 * lose most of a day's edits. The snapshot format is lib/backup.ts;
 * scripts/backup-drill.ts restores one into a throwaway database and checks it
 * matches, and CI runs that drill on every pull request.
 *
 * Written to the PRIVATE Blob store (lib/private-blob.ts) at
 * backups/catalog-<date>T<hh-mm>.json: it holds hidden works, collectors'
 * credits and the source photos' coordinates, and nothing in a private store
 * can be read without its token. Until September 2026 snapshots sat in the
 * public store at a guessable name, then at an unguessable one. Without
 * PRIVATE_BLOB_READ_WRITE_TOKEN it still writes to the public store that way,
 * so backups never stop for want of the second store; the old public
 * snapshots age out on the same schedule once the private store is in use.
 *
 * It fails loudly: a snapshot that couldn't be written emails the owner,
 * since a backup nobody knows is missing is the one that's needed.
 */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const snapshot = await buildSnapshot(prisma, now);
    const json = JSON.stringify(snapshot, null, 2);
    const stamp = now.toISOString().slice(0, 16).replace(":", "-"); // 2026-10-01T06-00

    const privateToken = privateBlobToken();
    const blob = privateToken
      ? await put(`backups/catalog-${stamp}.json`, json, {
          access: "private",
          token: privateToken,
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true, // a re-run in the same minute replaces its own file
        })
      : await put(`backups/catalog-${stamp}.json`, json, {
          access: "public",
          contentType: "application/json",
          // Public: the random suffix is all that keeps the URL unguessable.
          addRandomSuffix: true,
        });

    // Prune old snapshots in both stores. Runs only after this write succeeded,
    // so a failed backup never deletes the history that would have replaced it.
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
    const stores: (string | undefined)[] = privateToken ? [undefined, privateToken] : [undefined];
    let pruned = 0;
    for (const token of stores) {
      const stale: string[] = [];
      let cursor: string | undefined;
      do {
        const page: Awaited<ReturnType<typeof list>> = await list({
          prefix: "backups/catalog-",
          cursor,
          limit: 1000,
          ...(token ? { token } : {}),
        });
        for (const b of page.blobs) {
          // Compare on the date in the name rather than uploadedAt, so a
          // re-uploaded old snapshot still ages out.
          const day = b.pathname.match(/catalog-(\d{4}-\d{2}-\d{2})/)?.[1];
          if (day && day < cutoff) stale.push(token ? b.pathname : b.url);
        }
        cursor = page.cursor;
      } while (cursor);
      if (stale.length) await del(stale, token ? { token } : undefined);
      pruned += stale.length;
    }

    return NextResponse.json({
      ok: true,
      store: privateToken ? "private" : "public (PRIVATE_BLOB_READ_WRITE_TOKEN not set)",
      count: snapshot.count,
      pathname: blob.pathname,
      pruned,
      keepingFrom: cutoff,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await sendAlert("Catalogue backup failed", `This snapshot was not written.\n\n${msg}`).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

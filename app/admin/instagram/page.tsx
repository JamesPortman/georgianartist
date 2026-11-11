import { requireAuth } from "@/app/actions/admin";
import { logoutAction } from "@/app/actions/admin";
import { getQueueAction, getPostedAction, getNeedsReviewAction } from "@/app/actions/instagram";
import Link from "next/link";
import InstagramQueueClient from "./InstagramQueueClient";
import { siteConfig } from "@/data/siteConfig";

export const metadata = { title: "Instagram Queue | Admin" };
export const dynamic = "force-dynamic";

// Server actions invoked from this page run in this segment's function, and
// publishNowAction can sit polling Meta while it transcodes a Reel (up to
// IG_REEL_POLL_BUDGET_MS). Matches the cron route, for the same reason — and
// must be raised WITH it. A poll budget longer than this segment's maxDuration
// means the function is killed while publishing, which is the one failure that
// can't be retried.
export const maxDuration = 120;

export default async function InstagramAdminPage() {
  await requireAuth();

  const [queue, posted, needsReview] = await Promise.all([
    getQueueAction(),
    getPostedAction(),
    getNeedsReviewAction(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-brand text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">{siteConfig.brand} · Admin</h1>
          <nav className="hidden sm:flex gap-4 text-sm text-white/80">
            <Link href="/admin/products" className="hover:text-white">Products</Link>
            <span className="text-white font-medium">Instagram</span>
            <Link href="/admin/analytics" className="hover:text-white">Analytics</Link>
            <Link href="/admin/security" className="hover:text-white">Security</Link>
          </nav>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-white/80 hover:text-white underline">Sign out</button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <InstagramQueueClient queue={queue} posted={posted} needsReview={needsReview} />
      </main>
    </div>
  );
}

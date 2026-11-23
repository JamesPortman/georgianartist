import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAuth, logoutAction } from "@/app/actions/admin";
import { siteConfig } from "@/data/siteConfig";
import CommissionListClient from "./CommissionListClient";

export const metadata = { title: "Commissions | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminCommissionsPage() {
  await requireAuth();
  const examples = await prisma.commissionExample.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-brand text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">{siteConfig.brand} · Admin</h1>
          <nav className="hidden sm:flex gap-4 text-sm text-white/80">
            <Link href="/admin/products" className="hover:text-white">Products</Link>
            <Link href="/admin/instagram" className="hover:text-white">Instagram</Link>
            <Link href="/admin/analytics" className="hover:text-white">Analytics</Link>
            <span className="text-white font-medium">Commissions</span>
            <Link href="/admin/films" className="hover:text-white">Films</Link>
            <Link href="/admin/security" className="hover:text-white">Security</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/commissions/new"
            className="inline-block bg-white text-brand font-semibold px-4 py-1.5 rounded text-sm hover:bg-gray-100 transition-colors"
          >
            + Add example
          </Link>
          <form action={logoutAction}>
            <button className="text-sm text-white/80 hover:text-white underline">Sign out</button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <p className="text-sm text-gray-500">
          Examples shown on{" "}
          <Link href="/commissions" className="underline underline-offset-2 hover:no-underline">
            /commissions
          </Link>
          , in this order. Name the subject only, never the client, and only with the client&apos;s OK.
          Hidden examples are visible here but not on the site.
        </p>
        <CommissionListClient
          examples={examples.map((e) => ({
            id: e.id,
            kind: e.kind,
            name: e.name,
            subject: e.subject,
            medium: e.medium,
            size: e.size,
            image: e.image,
            visible: e.visible,
          }))}
        />
      </main>
    </div>
  );
}

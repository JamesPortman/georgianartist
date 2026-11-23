import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAuth, logoutAction } from "@/app/actions/admin";
import { siteConfig } from "@/data/siteConfig";
import FilmListClient from "./FilmListClient";

export const metadata = { title: "Films | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminFilmsPage() {
  await requireAuth();
  const films = await prisma.makingOf.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const ids = films.map((f) => f.productId).filter((v): v is string => !!v);
  const works = ids.length
    ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } })
    : [];
  const titleOf = new Map(works.map((w) => [w.id, w.title]));
  const shown = films.filter((f) => f.visible).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-brand text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">{siteConfig.brand} · Admin</h1>
          <nav className="hidden sm:flex gap-4 text-sm text-white/80">
            <Link href="/admin/products" className="hover:text-white">Products</Link>
            <Link href="/admin/instagram" className="hover:text-white">Instagram</Link>
            <Link href="/admin/analytics" className="hover:text-white">Analytics</Link>
            <Link href="/admin/commissions" className="hover:text-white">Commissions</Link>
            <span className="text-white font-medium">Films</span>
            <Link href="/admin/security" className="hover:text-white">Security</Link>
          </nav>
        </div>
        <form action={logoutAction}>
          <button className="text-sm text-white/80 hover:text-white underline">Sign out</button>
        </form>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        <p className="text-sm text-gray-500">
          The making-of films, in the order they appear on{" "}
          <Link href="/making-of" className="underline underline-offset-2 hover:no-underline">
            /making-of
          </Link>
          . {shown} of {films.length} showing. A hidden film leaves that page, its work&apos;s own
          page and its pin on the Locations map; it stays here, and its files are kept. When no
          film is showing, the Making Of link leaves the menu too.
        </p>
        <FilmListClient
          films={films.map((f) => ({
            id: f.id,
            title: f.title,
            posterUrl: f.posterUrl,
            seconds: f.seconds,
            work: f.productId ? (titleOf.get(f.productId) ?? null) : null,
            visible: f.visible,
          }))}
        />
      </main>
    </div>
  );
}

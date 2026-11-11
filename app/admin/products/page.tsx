import { requireAuth } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { logoutAction, refreshCatalogueAction } from "@/app/actions/admin";
import ProductTableClient, { type AdminProduct } from "./ProductTableClient";
import { siteConfig } from "@/data/siteConfig";


export const metadata = { title: "Products | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await requireAuth();

  const products = await prisma.product.findMany({
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  });

  const toAdmin = (p: (typeof products)[number]): AdminProduct => ({
    id: p.id,
    title: p.title,
    image: p.image,
    category: p.category,
    onSale: p.onSale,
    isNew: p.isNew,
    soldOut: p.soldOut,
    visible: p.visible,
    inspirationImage: p.inspirationImage,
  });

  const paintings = products.filter((p) => p.type === "painting").map(toAdmin);
  const photographs = products.filter((p) => p.type === "photograph").map(toAdmin);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — pinned so the brand bar + actions stay reachable */}
      <header className="sticky top-0 z-30 bg-brand text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-semibold">{siteConfig.brand} · Admin</h1>
          <nav className="hidden sm:flex gap-4 text-sm text-white/80">
            <span className="text-white font-medium">Products</span>
            <Link href="/admin/instagram" className="hover:text-white">Instagram</Link>
            <Link href="/admin/analytics" className="hover:text-white">Analytics</Link>
            <Link href="/admin/security" className="hover:text-white">Security</Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin/products/new"
            className="inline-block bg-white text-brand font-semibold px-4 py-1.5 rounded text-sm hover:bg-gray-100 transition-colors"
          >
            + Add product
          </Link>
          <form action={refreshCatalogueAction}>
            <button
              className="text-sm text-white/80 hover:text-white underline"
              title="Show changes made outside the admin (a script, the database console) now, rather than within the hour"
            >
              Refresh site
            </button>
          </form>
          <form action={logoutAction}>
            <button className="text-sm text-white/80 hover:text-white underline">Sign out</button>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-xs text-gray-400 mb-6">
          Drag the ⠿ handle to reorder how products appear on the site.
        </p>
        <div className="space-y-10">
          <ProductTableClient title="Paintings" products={paintings} />
          <ProductTableClient title="Photographs" products={photographs} />
        </div>
      </main>
    </div>
  );
}

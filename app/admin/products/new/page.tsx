import { requireAuth } from "@/app/actions/admin";
import { sizeOptions } from "@/data/products";
import Link from "next/link";
import NewProductForm from "./NewProductForm";

export const metadata = { title: "Add Product | Admin" };
export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAuth();
  const sizeTypes = Object.keys(sizeOptions);

  // Standard "from" price for each size type = its lowest sale price.
  const standardPrices: Record<string, number> = Object.fromEntries(
    Object.entries(sizeOptions).map(([k, opts]) => [
      k,
      Math.min(...opts.map((o) => o.salePrice)),
    ])
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand text-white px-6 py-4 flex items-center gap-4">
        <Link href="/admin/products" className="text-white/80 hover:text-white text-sm">
          ← Products
        </Link>
        <h1 className="text-lg font-semibold">Add Product</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <NewProductForm sizeTypes={sizeTypes} standardPrices={standardPrices} />
      </main>
    </div>
  );
}

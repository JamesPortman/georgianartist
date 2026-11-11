import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import type { Product } from "@/data/products";
import { siteConfig } from "@/data/siteConfig";
import { catalogue } from "@/lib/catalogue-cache";

export const metadata: Metadata = {
  title: `${siteConfig.brand} | Original Canadian Paintings`,
  description: "Browse and purchase original canvas paintings of Georgian Bay and the surrounding Ontario region. Gallery-wrapped, ready to hang.",
  alternates: { canonical: "/" },
};

// Read products live from the DB on each request so admin edits show
// immediately and the build never depends on database connectivity.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rows = await catalogue.product.findMany({
    where: { type: "painting", visible: true },
    orderBy: { sortOrder: "asc" },
  });

  const products: Product[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    image: p.image,
    category: p.category,
    sizeType: p.sizeType as Product["sizeType"],
    price: p.price,
    onSale: p.onSale,
    isNew: p.isNew || undefined,
    soldOut: p.soldOut || undefined,
    description: p.description ?? undefined,
    blurDataURL: p.blurDataURL ?? undefined,
  }));

  const categories = [...new Set(products.map((p) => p.category))].sort();

  return <HomeClient products={products} categories={categories} />;
}

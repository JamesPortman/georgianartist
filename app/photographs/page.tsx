import type { Metadata } from "next";
import { Suspense } from "react";
import PhotographsClient from "./PhotographsClient";
import type { Photograph } from "@/data/photographs";
import { siteConfig } from "@/data/siteConfig";
import { catalogue } from "@/lib/catalogue-cache";

export const metadata: Metadata = {
  title: `Photographs | ${siteConfig.brand}`,
  description: "Fine art photographic prints of Georgian Bay, Grey Highlands, and the surrounding Ontario landscape. Available in multiple sizes.",
  alternates: { canonical: "/photographs" },
};

export const dynamic = "force-dynamic";

export default async function PhotographsPage() {
  const rows = await catalogue.product.findMany({
    where: { type: "photograph", visible: true },
    orderBy: { sortOrder: "asc" },
  });

  const photographs: Photograph[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    image: p.image,
    category: p.category,
    sizeType: p.sizeType as Photograph["sizeType"],
    price: p.price,
    onSale: p.onSale,
    isNew: p.isNew || undefined,
    soldOut: p.soldOut || undefined,
    description: p.description ?? undefined,
    blurDataURL: p.blurDataURL ?? undefined,
    naturalWidth: p.naturalWidth ?? 1200,
    naturalHeight: p.naturalHeight ?? 800,
  }));

  const categories = [...new Set(photographs.map((p) => p.category))].sort();

  return (
    <Suspense fallback={null}>
      <PhotographsClient photographs={photographs} categories={categories} />
    </Suspense>
  );
}

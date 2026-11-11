import { catalogue } from "@/lib/catalogue-cache";
import type { Metadata } from "next";
import { sizeOptions, type Product } from "@/data/products";
import { notFound, permanentRedirect } from "next/navigation";
import { safeJsonLd } from "@/lib/json-ld";
import { availabilitySchema } from "@/lib/availability";
import ProductDetailClient from "./ProductDetailClient";
import { getMakingOfForProduct } from "@/lib/making-of";
import { siteConfig } from "@/data/siteConfig";
import { absoluteImageUrl } from "@/lib/catalogue-images";
import { findWorkBySlug } from "@/lib/product-lookup";
import { productPath } from "@/lib/product-path";

export const dynamic = "force-dynamic";

// The [id] segment is the work's URL slug (lib/product-path.ts), not its id.
async function getProduct(slug: string) {
  return (await findWorkBySlug(slug, "painting")).work;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: `${siteConfig.brand}` };
  const sizes = sizeOptions[product.sizeType as keyof typeof sizeOptions];
  const minPrice = Math.min(...sizes.map((s) => s.salePrice));
  const maxPrice = Math.max(...sizes.map((s) => s.salePrice));
  const priceRange = minPrice === maxPrice ? `CA$${minPrice}` : `CA$${minPrice}–CA$${maxPrice}`;
  const description = product.soldOut
    ? `${product.title}: canvas print by ${siteConfig.brand}. This edition is sold out. Similar work available.`
    : `${product.title}: canvas print by ${siteConfig.brand}. ${priceRange}. Gallery-wrapped, ready to hang. Ships across Canada.`;
  return {
    title: `${product.title} | ${siteConfig.brand}`,
    description,
    alternates: { canonical: productPath(product) },
    openGraph: {
      images: [{ url: product.image, width: 1200, alt: product.title }],
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const { work: product, redirect } = await findWorkBySlug(slug, "painting");
  // A retired slug: the work was renamed, and its old links still arrive here.
  if (redirect) permanentRedirect(redirect);
  if (!product) notFound();
  const id = product.id;

  const relatedRows = await catalogue.product.findMany({
    where: {
      type: "painting",
      visible: true,
      // A "you might also like" pointing at a sold-out piece is a dead end
      // offered as a suggestion.
      soldOut: false,
      category: product.category,
      NOT: { id },
    },
    orderBy: { sortOrder: "asc" },
    take: 4,
  });
  const related = relatedRows.map((p) => ({
    id: p.id, slug: p.slug, title: p.title, image: p.image, category: p.category,
    sizeType: p.sizeType as Product["sizeType"], price: p.price,
    onSale: p.onSale, isNew: p.isNew || undefined, description: p.description ?? undefined,
    blurDataURL: p.blurDataURL ?? undefined,
  }));

  const film = await getMakingOfForProduct(id);

  const sizes = sizeOptions[product.sizeType as keyof typeof sizeOptions];
  const prices = sizes.map((s) => s.salePrice);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    image: absoluteImageUrl(product.image),
    description: product.description ?? `Fine art print by ${siteConfig.brand}.`,
    brand: { "@type": "Brand", name: `${siteConfig.brand}` },
    offers: {
      "@type": "AggregateOffer",
      offerCount: sizes.length,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      priceCurrency: "CAD",
      availability: availabilitySchema(product.soldOut),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <ProductDetailClient
        product={{ id: product.id, slug: product.slug, title: product.title, image: product.image,
          category: product.category, sizeType: product.sizeType as Product["sizeType"],
          price: product.price, onSale: product.onSale, isNew: product.isNew || undefined,
          soldOut: product.soldOut || undefined,
          description: product.description ?? undefined, blurDataURL: product.blurDataURL ?? undefined,
          inspirationImage: product.inspirationImage ?? undefined,
          inspirationLat: product.inspirationLat ?? undefined,
          inspirationLng: product.inspirationLng ?? undefined,
          homePhoto: product.homePhoto ?? undefined,
          mockupImage: product.mockupImage ?? undefined,
          homePhotoCredit: product.homePhotoCredit ?? undefined }}
        related={related}
        film={film}
      />
    </>
  );
}

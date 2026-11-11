import type { Metadata } from "next";
import { sizeOptions } from "@/data/products";
import type { Photograph } from "@/data/photographs";
import { notFound, permanentRedirect } from "next/navigation";
import { safeJsonLd } from "@/lib/json-ld";
import { availabilitySchema } from "@/lib/availability";
import PhotographDetailClient from "./PhotographDetailClient";
import { getMakingOfForProduct } from "@/lib/making-of";
import { siteConfig } from "@/data/siteConfig";
import { absoluteImageUrl } from "@/lib/catalogue-images";
import { findWorkBySlug } from "@/lib/product-lookup";
import { productPath } from "@/lib/product-path";

export const dynamic = "force-dynamic";

// The [id] segment is the work's URL slug (lib/product-path.ts), not its id.
async function getPhoto(slug: string) {
  return (await findWorkBySlug(slug, "photograph")).work;
}

function dbToPhoto(p: NonNullable<Awaited<ReturnType<typeof getPhoto>>>): Photograph {
  return {
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
    // Shared GPS columns: for a photograph these are where it was taken.
    lat: p.inspirationLat ?? undefined,
    lng: p.inspirationLng ?? undefined,
  };
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const row = await getPhoto(id);
  if (!row) return { title: `${siteConfig.brand}` };
  const photo = dbToPhoto(row);
  const sizes = sizeOptions[photo.sizeType];
  const minPrice = Math.min(...sizes.map((s) => s.salePrice));
  const maxPrice = Math.max(...sizes.map((s) => s.salePrice));
  const priceRange = minPrice === maxPrice ? `CA$${minPrice}` : `CA$${minPrice}–CA$${maxPrice}`;
  const description = photo.soldOut
    ? `${photo.title}: fine art photographic print by ${siteConfig.brand}. This edition is sold out. Similar work available.`
    : `${photo.title}: fine art photographic print by ${siteConfig.brand}. ${priceRange}. Ships across Canada.`;
  return {
    title: `${photo.title} | ${siteConfig.brand}`,
    description,
    alternates: { canonical: productPath(row) },
    openGraph: {
      images: [{ url: photo.image, width: 1200, alt: photo.title }],
    },
  };
}

export default async function PhotographPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const { work: row, redirect } = await findWorkBySlug(slug, "photograph");
  // A retired slug: the work was renamed, and its old links still arrive here.
  if (redirect) permanentRedirect(redirect);
  if (!row) notFound();
  const id = row.id;
  const photo = dbToPhoto(row);

  const film = await getMakingOfForProduct(id);

  const sizes = sizeOptions[photo.sizeType];
  const prices = sizes.map((s) => s.salePrice);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: photo.title,
    image: absoluteImageUrl(photo.image),
    description: photo.description ?? `Fine art photographic print by ${siteConfig.brand}.`,
    brand: { "@type": "Brand", name: `${siteConfig.brand}` },
    offers: {
      "@type": "AggregateOffer",
      offerCount: sizes.length,
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      priceCurrency: "CAD",
      availability: availabilitySchema(photo.soldOut),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <PhotographDetailClient photo={photo} film={film} />
    </>
  );
}

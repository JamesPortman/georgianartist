import { catalogue } from "@/lib/catalogue-cache";
import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/siteConfig";
import { productPath } from "@/lib/product-path";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/photographs`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/gift-shop`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/gift-shop/calendar`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/for-artists`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/architecture`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/architecture/tests`, changeFrequency: "monthly", priority: 0.2 },
    // The scan destination for the printed flier's QR code — it needs to be
    // findable by search too, not only by camera.
    { url: `${base}/book`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/locations`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/making-of`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const allProducts = await catalogue.product.findMany({
    where: { visible: true },
    select: { id: true, slug: true, type: true, updatedAt: true },
  });

  const productRoutes: MetadataRoute.Sitemap = allProducts.map((p) => ({
    url: `${base}${productPath(p)}`,
    lastModified: p.updatedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...productRoutes];
}

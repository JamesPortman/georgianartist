import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { giftShopProducts } from "@/data/giftShop";
import { siteConfig } from "@/data/siteConfig";
import { distinctShowcases, getVisibleWorks } from "@/lib/showcase";

export const metadata: Metadata = {
  title: `Gift Shop | ${siteConfig.brand}`,
  description:
    "Custom calendars, greeting card packs, and postcard packs built from Georgian Bay paintings and photographs.",
  alternates: { canonical: "/gift-shop" },
};

// Thumbnails come from the live catalogue, so hiding a work can't leave the
// shop advertising it — or, since sold-out work isn't offered here, selling it.
export const dynamic = "force-dynamic";

export default async function GiftShopPage() {
  const works = await getVisibleWorks(undefined, { forSale: true });
  const thumbs = distinctShowcases(
    works,
    giftShopProducts.map((p) => ({ key: p.id, preferred: p.showcase }))
  );
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold text-gray-800 mb-2">Gift Shop</h1>
        <p className="text-gray-500 italic text-lg">
          Build your own from any artwork currently available
        </p>
        <p className="text-sm text-brand mt-3 font-medium">
          Free shipping in Canada on orders over CA${siteConfig.freeShipping.threshold}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {giftShopProducts.map((product, i) => {
          const thumb = thumbs[i];
          return (
            <Link key={product.id} href={product.href} className="block">
              <div className="relative bg-white border border-gray-200 rounded-sm overflow-hidden group transition-shadow hover:shadow-md">
                <div className="relative w-full aspect-[4/3] bg-gray-100">
                  {thumb && (
                    <Image
                      src={thumb.image}
                      alt={`${product.title}, example artwork: ${thumb.title}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      placeholder={thumb.blurDataURL ? "blur" : "empty"}
                      blurDataURL={thumb.blurDataURL}
                    />
                  )}
                </div>
                <div className="p-4">
                  <h2 className="text-lg font-semibold text-gray-800 mb-1">{product.title}</h2>
                  <p className="text-sm text-gray-500 mb-3">{product.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-semibold text-gray-900">
                      CA${product.priceCAD}
                    </span>
                    <span className="text-xs text-gray-500">
                      {product.photoCount} images
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-center text-sm text-gray-500 mt-10">
        Have a different gift in mind?{" "}
        <Link href="/contact" className="text-brand underline underline-offset-2 hover:no-underline">
          Get in touch
        </Link>
        . Commissions and custom orders welcome.
      </p>
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { Product } from "@/data/products";
import { blurDataURLs } from "@/data/blurs";
import { productSlug } from "@/lib/product-path";
import { track } from "@/components/AnalyticsTracker";

export default function ProductCard({
  product,
  basePath = "/products",
  priority = false,
}: {
  product: Product;
  basePath?: string;
  /** Load the image eagerly, with high priority: for the first cards on screen. */
  priority?: boolean;
}) {
  const blur = product.blurDataURL ?? blurDataURLs[product.id];

  return (
    <Link
      href={`${basePath}/${productSlug(product)}`}
      className="block"
      onClick={() => track("product_click", { productId: product.id })}
    >
      <div className="bg-white rounded-sm shadow-sm hover:shadow-md transition-shadow overflow-hidden group cursor-pointer">
        <div className="relative aspect-[4/3] bg-gray-100 overflow-hidden">
          <Image
            src={product.image}
            alt={product.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            placeholder={blur ? "blur" : "empty"}
            blurDataURL={blur}
          />
          {/* Sold out replaces New/Sale rather than stacking with them — a card
              badged "New" and "Sold out" at once reads as a mistake. */}
          {product.soldOut ? (
            <span className="absolute top-2 left-2 bg-gray-800 text-white text-xs font-semibold px-1.5 py-0.5 rounded">
              Sold out
            </span>
          ) : (
            <>
              {product.isNew && (
                <span className="absolute top-2 left-2 bg-brand text-white text-xs font-semibold px-1.5 py-0.5 rounded">
                  New
                </span>
              )}
              {product.onSale && (
                <span className="absolute top-2 right-2 bg-amber-500 text-gray-900 text-xs font-semibold px-1.5 py-0.5 rounded">
                  Sale
                </span>
              )}
            </>
          )}
        </div>
        <div className="p-3">
          <h3 className="text-sm font-medium text-gray-800 leading-snug">{product.title}</h3>
          {product.soldOut ? (
            <p className="text-sm text-gray-500 mt-1">Sold out</p>
          ) : (
            <p className="text-sm text-gray-600 mt-1">from CA${product.price.toFixed(2)}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

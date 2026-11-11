"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { blurDataURLs } from "@/data/blurs";
import { giftShopProducts } from "@/data/giftShop";
import { siteConfig } from "@/data/siteConfig";
import BuyNowButton from "@/components/BuyNowButton";
import { MONTHS } from "@/lib/order";
import type { GalleryItem } from "./gallery";

/** Generalized builder for any gift-shop pack (calendar / card pack / postcard pack). */
export default function PackBuilderClient({
  productId,
  gallery,
}: {
  productId: string;
  gallery: GalleryItem[];
}) {
  const config = giftShopProducts.find((p) => p.id === productId)!;
  const isCalendar = config.id === "calendar";
  const REQUIRED = config.photoCount;

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const remaining = REQUIRED - selectedIds.length;
  const isComplete = selectedIds.length === REQUIRED;

  const slotBadge = (idx: number) => (isCalendar ? (MONTHS[idx]?.slice(0, 3) ?? `${idx + 1}`) : `${idx + 1}`);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= REQUIRED) return prev;
      return [...prev, id];
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <Link href="/gift-shop" className="text-sm text-brand hover:underline mb-6 inline-block">
        ← Back to gift shop
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-gray-800 mb-2">{config.title}</h1>
        <p className="text-gray-600 leading-relaxed">{config.description}</p>
        <p className="text-sm text-gray-500 mt-2">
          CA${config.priceCAD} · {config.photoCount} images · Free shipping in Canada on orders over CA$
          {siteConfig.freeShipping.threshold}
        </p>
      </div>

      {/* Selection summary — sticky just below nav */}
      <div className="sticky top-[52px] z-30 bg-white border-y border-gray-200 -mx-4 px-4 py-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-800">
            {selectedIds.length} of {REQUIRED} selected
          </span>
          {!isComplete && (
            <span className="text-xs text-gray-500">
              {remaining} more to go. They appear in the order you select them
            </span>
          )}
          {selectedIds.length > 0 && (
            <button onClick={() => setSelectedIds([])} className="ml-auto text-xs text-brand hover:underline">
              Clear selection
            </button>
          )}
        </div>
        <div className="mt-2 h-1.5 bg-gray-100 rounded overflow-hidden">
          <div
            className="h-full bg-brand transition-all"
            style={{ width: `${(selectedIds.length / REQUIRED) * 100}%` }}
          />
        </div>
      </div>

      {/* Selected preview */}
      {selectedIds.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-medium text-gray-700 mb-3 uppercase tracking-wide">Your selection</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {selectedIds.map((id, idx) => {
              const item = gallery.find((g) => g.id === id);
              if (!item) return null;
              const blur = item.blurDataURL ?? blurDataURLs[id];
              return (
                <div key={id} className="relative aspect-square bg-gray-100 rounded-sm overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 33vw, 16vw"
                    placeholder={blur ? "blur" : "empty"}
                    blurDataURL={blur ?? undefined}
                  />
                  <span className="absolute top-1 left-1 bg-brand text-white text-xs font-semibold px-1.5 py-0.5 rounded">
                    {slotBadge(idx)}
                  </span>
                  <button
                    onClick={() => toggle(id)}
                    className="absolute top-1 right-1 bg-white/90 hover:bg-white text-gray-700 hover:text-red-600 text-xs w-5 h-5 rounded-full flex items-center justify-center"
                    aria-label={`Remove ${item.title}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Submit area */}
      {isComplete && (
        <div className="mb-10 p-5 bg-brand-tint border border-brand rounded">
          <p className="text-sm font-medium text-gray-800 mb-3">
            Ready to order? Submit your {config.shortTitle.toLowerCase()} enquiry below.
          </p>
          <BuyNowButton
            order={{ kind: "pack", packId: config.id, imageIds: selectedIds }}
            title={config.title}
            sizeLabel={`${config.photoCount}-image ${config.shortTitle}`}
            price={config.priceCAD}
            ctaLabel={`Submit ${config.shortTitle} Order`}
          />
        </div>
      )}

      {/* Picker */}
      <h2 className="text-sm font-medium text-gray-700 mb-4 uppercase tracking-wide">
        Choose your images ({gallery.length} available)
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {gallery.map((item) => {
          const idx = selectedIds.indexOf(item.id);
          const selected = idx !== -1;
          const blur = item.blurDataURL ?? blurDataURLs[item.id];
          const full = !selected && selectedIds.length >= REQUIRED;
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              disabled={full}
              className={`relative aspect-square bg-gray-100 rounded-sm overflow-hidden transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                selected
                  ? "ring-4 ring-brand ring-offset-2"
                  : full
                    ? "opacity-40 cursor-not-allowed"
                    : "hover:opacity-90 cursor-pointer"
              }`}
              aria-pressed={selected}
              title={item.title}
              // A painting and the photograph it came from share a title, so
              // title alone cannot identify one item. Tests select on this.
              data-id={item.id}
            >
              <Image
                src={item.image}
                alt={item.title}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                placeholder={blur ? "blur" : "empty"}
                blurDataURL={blur ?? undefined}
              />
              {selected && (
                <div className="absolute inset-0 bg-brand/30 flex items-center justify-center">
                  <span className="bg-brand text-white font-bold w-8 h-8 rounded-full flex items-center justify-center text-sm">
                    {idx + 1}
                  </span>
                </div>
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] py-1 px-2 text-left truncate">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

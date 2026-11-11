"use client";

import { useState } from "react";
import Image from "next/image";
import Lightbox from "@/components/Lightbox";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Photograph } from "@/data/photographs";
import { sizeLabelWithCm } from "@/lib/product-utils";
import { sizeOptions, SizeOption } from "@/data/products";
import { blurDataURLs } from "@/data/blurs";
import {
  GREETING_CARD_SINGLE_CAD,
  POSTCARD_SINGLE_CAD,
} from "@/data/merchandise";
import { siteConfig } from "@/data/siteConfig";
import BuyNowButton from "@/components/BuyNowButton";
import SoldOutPanel from "@/components/SoldOutPanel";
import LocationMap from "@/components/LocationMap";
import MakingOfVideo, { type MakingOfFilm } from "@/components/MakingOfVideo";

export default function PhotographDetailClient({
  photo,
  film,
}: {
  photo: Photograph;
  film?: MakingOfFilm | null;
}) {
  const router = useRouter();
  const sizes = sizeOptions[photo.sizeType];
  const [selected, setSelected] = useState<SizeOption>(sizes[0]);
  const [framed, setFramed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const blur = photo.blurDataURL ?? blurDataURLs[photo.id];

  // Frame pricing varies by size + frame type — quoted separately.
  const buyTitle = framed ? `${photo.title} (+ frame quote)` : photo.title;
  const buySizeLabel = framed ? `${selected.label} (frame quote requested)` : selected.label;

  const isPanoramic = photo.naturalWidth / photo.naturalHeight > 1.8;
  const hasLocation = typeof photo.lat === "number" && typeof photo.lng === "number";


  function handleBack() {
    try {
      if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
        router.back();
      } else {
        router.push("/photographs");
      }
    } catch {
      router.push("/photographs");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <button
        onClick={handleBack}
        className="text-sm text-brand hover:underline mb-6 inline-block"
      >
        ← Back to photographs
      </button>

      {isPanoramic && (
        <button
          className="relative w-full mb-8 rounded-sm overflow-hidden bg-gray-100 mt-4 cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 block"
          onClick={() => setLightboxOpen(true)}
          aria-label={`Enlarge image of ${photo.title}`}
        >
          <Image
            src={photo.image}
            alt={photo.title}
            width={photo.naturalWidth}
            height={photo.naturalHeight}
            className="w-full h-auto"
            sizes="100vw"
            priority
            placeholder={blur ? "blur" : "empty"}
            blurDataURL={blur}
          />
          <span className="absolute bottom-2 right-2 bg-black/40 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
            Click to enlarge
          </span>
        </button>
      )}

      <div className={`grid gap-10 mt-4 ${isPanoramic ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
        {!isPanoramic && (
          <div>
            <button
              className="relative w-full aspect-[4/3] bg-gray-100 rounded-sm overflow-hidden cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Enlarge image of ${photo.title}`}
            >
              <Image
                src={photo.image}
                alt={photo.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
                placeholder={blur ? "blur" : "empty"}
                blurDataURL={blur}
              />
              <span className="absolute bottom-2 right-2 bg-black/40 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
                Click to enlarge
              </span>
            </button>

            {/* Where the photo was taken — sits under the image */}
            {hasLocation && <LocationMap lat={photo.lat!} lng={photo.lng!} />}
          </div>
        )}

        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold text-gray-800 mb-1">{photo.title}</h1>
          <p className="text-sm text-gray-500 mb-4">{photo.category}</p>

          {photo.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-6">{photo.description}</p>
          )}

          {/* Panoramic photos run full width above, so the map lives here instead */}
          {isPanoramic && hasLocation && (
            <div className="mb-6">
              <LocationMap lat={photo.lat!} lng={photo.lng!} />
            </div>
          )}

          {photo.soldOut ? (
            <SoldOutPanel title={photo.title} productId={photo.id} />
          ) : (
            <>
          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-2xl font-semibold text-gray-900">
              CA${selected.salePrice.toFixed(2)}
            </span>
            <span className="text-base text-gray-600 line-through">
              CA${selected.regularPrice.toFixed(2)}
            </span>
          </div>

          <div className="mb-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Size</p>
            <div className="flex flex-col gap-2">
              {sizes.map((size) => (
                <button
                  key={size.label}
                  onClick={() => setSelected(size)}
                  className={`flex items-center justify-between px-4 py-3 border rounded text-sm transition-colors text-left ${
                    selected.label === size.label
                      ? "border-brand bg-brand-tint text-brand font-medium"
                      : "border-gray-200 bg-white text-gray-700 hover:border-brand"
                  }`}
                >
                  <span>{sizeLabelWithCm(size)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">CA${size.salePrice.toFixed(2)}</span>
                    <span className="text-gray-600 line-through text-xs">CA${size.regularPrice.toFixed(2)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded cursor-pointer hover:border-brand transition-colors">
              <input
                type="checkbox"
                checked={framed}
                onChange={(e) => setFramed(e.target.checked)}
                className="w-4 h-4 accent-brand"
              />
              <span className="flex-1 text-sm text-gray-700">
                Add a frame
              </span>
              <span className="text-xs text-gray-500 italic">Ask for a quote based on frame type</span>
            </label>
          </div>

          <div className="mb-6">
            <BuyNowButton
              order={{ kind: "print", productId: photo.id, size: selected.label, framed }}
              title={buyTitle}
              sizeLabel={buySizeLabel}
              price={selected.salePrice}
              productId={photo.id}
            />
          </div>

          <div className="mb-6">
            <p className="text-xs font-medium text-gray-700 mb-2">Also available as</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-gray-200 rounded p-3">
                <p className="text-sm font-medium text-gray-800">Greeting card</p>
                <p className="text-xs text-gray-500 mb-2">{'5"×7" folded card, blank inside'}</p>
                <BuyNowButton
                  order={{ kind: "card", productId: photo.id, card: "greeting" }}
                  title={photo.title}
                  sizeLabel="Greeting card"
                  price={GREETING_CARD_SINGLE_CAD}
                  compact
                  productId={photo.id}
                />
              </div>
              <div className="border border-gray-200 rounded p-3">
                <p className="text-sm font-medium text-gray-800">Postcard</p>
                <p className="text-xs text-gray-500 mb-2">{'4"×6" matte card, mail-ready'}</p>
                <BuyNowButton
                  order={{ kind: "card", productId: photo.id, card: "postcard" }}
                  title={photo.title}
                  sizeLabel="Postcard"
                  price={POSTCARD_SINGLE_CAD}
                  compact
                  productId={photo.id}
                />
              </div>
            </div>
          </div>
            </>
          )}

          {!photo.soldOut && (
          <div className="border-t border-gray-100 pt-4 mb-4">
            <p className="text-xs font-medium text-gray-700 mb-2">How it works</p>
            <ol className="space-y-1 text-xs text-gray-500 list-decimal list-inside">
              <li>Click <span className="font-medium">Buy Now</span> and fill in your name and email</li>
              <li>Submit, and we confirm availability within 1 business day</li>
              <li>Pay by e-transfer, and we ship via Canada Post once payment is received</li>
            </ol>
          </div>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-1.5 text-xs text-gray-500">
            {!photo.soldOut && (
              <>
                <p>✓ Professional archival print</p>
                <p>✓ <span className="font-medium text-brand">Free shipping</span> on orders over CA${siteConfig.freeShipping.threshold}</p>
                <p>✓ Ships via Canada Post Expedited (5–7 business days)</p>
                <p>✓ Local pickup available in the Blue Mountain area</p>
              </>
            )}
            <p>✓ Commissions available: <Link href="/contact" className="text-brand underline underline-offset-2 hover:no-underline">contact us</Link> for a quote</p>
          </div>
        </div>
      </div>

      {film && (
        <div className="mt-12 border-t border-gray-100 pt-8">
          <MakingOfVideo film={film} heading="A painting made from this photograph" />
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox label={`${photo.title}, enlarged`} onClose={() => setLightboxOpen(false)}>
          <div className="relative w-[90vw] h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={photo.image}
              alt={photo.title}
              fill
              className="object-contain"
              sizes="90vw"
            />
          </div>
        </Lightbox>
      )}
    </div>
  );
}

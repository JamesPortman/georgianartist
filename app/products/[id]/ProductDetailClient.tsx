"use client";

import { useState } from "react";
import Image from "next/image";
import Lightbox from "@/components/Lightbox";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sizeLabelWithCm } from "@/lib/product-utils";
import { sizeOptions, SizeOption, type Product } from "@/data/products";
import { blurDataURLs } from "@/data/blurs";
import {
  GREETING_CARD_SINGLE_CAD,
  POSTCARD_SINGLE_CAD,
} from "@/data/merchandise";
import { siteConfig } from "@/data/siteConfig";
import BuyNowButton from "@/components/BuyNowButton";
import SoldOutPanel from "@/components/SoldOutPanel";
import ProductCard from "@/components/ProductCard";
import RoomView from "./RoomView";
import LocationMap from "@/components/LocationMap";
import MakingOfVideo, { type MakingOfFilm } from "@/components/MakingOfVideo";
import { mockupFor } from "@/lib/catalogue-images";

export default function ProductDetailClient({
  product,
  related,
  film,
}: {
  product: Product;
  related: Product[];
  film?: MakingOfFilm | null;
}) {
  const router = useRouter();
  const sizes = sizeOptions[product.sizeType];
  const [selected, setSelected] = useState<SizeOption>(sizes[0]);
  const [framed, setFramed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [view, setView] = useState<"painting" | "inspiration" | "room">("painting");

  const buyTitle = framed ? `${product.title} (+ frame quote)` : product.title;
  const buySizeLabel = framed ? `${selected.label} (frame quote requested)` : selected.label;
  const blur = product.blurDataURL ?? blurDataURLs[product.id];

  // Room view: the catalogue's paintings have a pre-generated mockup (on Blob
  // once migrated, lib/catalogue-images.ts); later uploads use the CSS
  // RoomView composite.
  const mockupSrc = mockupFor(product);
  const hasInspiration = !!product.inspirationImage;
  // A collector's own photo, when there is one, takes the room slot. A real
  // wall in a real house answers "how would it look in mine?" better than a
  // generated one, and showing both would set the staged version beside the
  // thing it was standing in for.
  const homePhoto = product.homePhoto;
  const activeSrc =
    view === "inspiration" && product.inspirationImage
      ? product.inspirationImage
      : view === "painting"
        ? product.image
        : homePhoto
          ? homePhoto
          : mockupSrc
            ? mockupSrc
            : product.image;
  // What activeSrc is showing, in words. Mirrors it branch for branch so the
  // main image and the lightbox can never describe the same picture two ways —
  // they did: enlarging a collector's photo dropped "in a collector's home"
  // and fell back to the bare title.
  const activeAlt =
    view === "inspiration" && product.inspirationImage
      ? `Inspiration photo for ${product.title}`
      : view === "painting"
        ? product.title
        : homePhoto
          ? `${product.title} hanging in a collector's home`
          : mockupSrc
            ? `${product.title} shown in a room`
            : product.title;
  // The collector's credit travels with their photo, wherever it is shown.
  const homeCredit = view === "room" && homePhoto ? product.homePhotoCredit : undefined;


  function handleBack() {
    try {
      if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
        router.back();
      } else {
        router.push("/");
      }
    } catch {
      router.push("/");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <button
        onClick={handleBack}
        className="text-sm text-brand hover:underline mb-6 inline-block"
      >
        ← Back to gallery
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-4">
        <div className="flex flex-col gap-3">
          {/* Active image — click to enlarge */}
          <button
            className="relative w-full rounded-sm overflow-hidden cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 bg-gray-100"
            onClick={() => setLightboxOpen(true)}
            aria-label={`Click to enlarge image of ${product.title}`}
          >
            {view === "room" && !mockupSrc && !homePhoto ? (
              <RoomView src={product.image} alt={`${product.title} shown in a room`} />
            ) : (
              <div className="relative w-full aspect-[4/3]">
                <Image
                  src={activeSrc}
                  alt={activeAlt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 50vw"
                  priority
                  placeholder={view === "painting" && blur ? "blur" : "empty"}
                  blurDataURL={view === "painting" ? blur : undefined}
                />
              </div>
            )}
            <span className="absolute bottom-2 right-2 bg-black/40 text-white text-xs px-2 py-0.5 rounded pointer-events-none">
              Click to enlarge
            </span>
          </button>

          {homeCredit && (
            <p className="text-xs text-gray-500 -mt-1">Photo courtesy of {homeCredit}</p>
          )}

          {/* View switcher: inspiration (if available) / painting / in a room.
              Tiles cap at half the width. With two they already sit under it
              (the gap takes a few pixels), so nothing changes there; alone,
              flex-1 used to stretch one tile across the whole row — a second,
              full-size copy of whatever the main image was showing. */}
          <div className="flex gap-2">
            {hasInspiration && (
              <button
                onClick={() => setView(view === "inspiration" ? "painting" : "inspiration")}
                className={`relative flex-1 max-w-[50%] aspect-[4/3] rounded-sm overflow-hidden border-2 transition-colors ${
                  view === "inspiration" ? "border-brand" : "border-gray-200 hover:border-gray-300"
                }`}
                aria-label="View the inspiration photo"
                aria-pressed={view === "inspiration"}
              >
                <Image src={product.inspirationImage!} alt="" fill className="object-cover" sizes="120px" />
                <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] py-0.5 text-center">
                  Inspiration
                </span>
              </button>
            )}
            <button
              onClick={() => setView(view === "room" ? "painting" : "room")}
              className={`relative flex-1 max-w-[50%] aspect-[4/3] rounded-sm overflow-hidden border-2 transition-colors ${
                view === "room" ? "border-brand" : "border-gray-200 hover:border-gray-300"
              }`}
              aria-label={homePhoto ? "View in a collector's home" : "View in a room"}
              aria-pressed={view === "room"}
            >
              {homePhoto ? (
                <Image src={homePhoto} alt="" fill className="object-cover" sizes="120px" />
              ) : mockupSrc ? (
                <Image src={mockupSrc} alt="" fill className="object-cover" sizes="120px" />
              ) : (
                <RoomView src={product.image} alt="" />
              )}
              {/* Labelled differently on purpose: a real photo and a generated
                  mockup must never look like the same claim. */}
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] py-0.5 text-center">
                {homePhoto ? "In a collector\u2019s home" : "In a Room"}
              </span>
            </button>
          </div>

          {/* Inspiration location map — sits under the inspiration image */}
          {hasInspiration &&
            typeof product.inspirationLat === "number" &&
            typeof product.inspirationLng === "number" && (
              <LocationMap
                lat={product.inspirationLat}
                lng={product.inspirationLng}
                label="Where the inspiration photo was taken"
                title="Inspiration location"
              />
            )}
        </div>

        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold text-gray-800 mb-1">{product.title}</h1>
          <p className="text-sm text-gray-500 mb-4">{product.category}</p>

          {product.description && (
            <p className="text-sm text-gray-600 leading-relaxed mb-6">{product.description}</p>
          )}

          {product.soldOut ? (
            <SoldOutPanel title={product.title} productId={product.id} />
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
              order={{ kind: "print", productId: product.id, size: selected.label, framed }}
              title={buyTitle}
              sizeLabel={buySizeLabel}
              price={selected.salePrice}
              productId={product.id}
            />
          </div>

          <div className="mb-6">
            <p className="text-xs font-medium text-gray-700 mb-2">Also available as</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-gray-200 rounded p-3">
                <p className="text-sm font-medium text-gray-800">Greeting card</p>
                <p className="text-xs text-gray-500 mb-2">{'5"×7" folded card, blank inside'}</p>
                <BuyNowButton
                  order={{ kind: "card", productId: product.id, card: "greeting" }}
                  title={product.title}
                  sizeLabel="Greeting card"
                  price={GREETING_CARD_SINGLE_CAD}
                  compact
                  productId={product.id}
                />
              </div>
              <div className="border border-gray-200 rounded p-3">
                <p className="text-sm font-medium text-gray-800">Postcard</p>
                <p className="text-xs text-gray-500 mb-2">{'4"×6" matte card, mail-ready'}</p>
                <BuyNowButton
                  order={{ kind: "card", productId: product.id, card: "postcard" }}
                  title={product.title}
                  sizeLabel="Postcard"
                  price={POSTCARD_SINGLE_CAD}
                  compact
                  productId={product.id}
                />
              </div>
            </div>
          </div>
            </>
          )}

          {!product.soldOut && (
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
            {/* Shipping and pickup describe an order nobody can place on a
                sold-out piece. Commissions still stand, so that line stays. */}
            {!product.soldOut && (
              <>
                <p>✓ Gallery-wrapped canvas, ready to hang</p>
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
          <MakingOfVideo film={film} />
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-12 border-t border-gray-100 pt-8">
          <h2 className="text-sm font-medium text-gray-700 mb-4">More from {product.category}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox label={`${product.title}, enlarged`} onClose={() => setLightboxOpen(false)}>
          <div className="relative w-[90vw] h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={activeSrc}
              alt={activeAlt}
              fill
              className="object-contain"
              sizes="90vw"
            />
          </div>
          {homeCredit && (
            <p className="absolute bottom-4 left-0 right-0 text-center text-sm text-white/70">
              Photo courtesy of {homeCredit}
            </p>
          )}
        </Lightbox>
      )}
    </div>
  );
}

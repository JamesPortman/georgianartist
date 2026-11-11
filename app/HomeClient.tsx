"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Product } from "@/data/products";
import ProductCard from "@/components/ProductCard";
import PressStrip from "@/components/PressStrip";
import Testimonial from "@/components/Testimonial";
import {
  SOLD_OUT_FILTER,
  excludesSoldOut,
  matchesAvailability,
  soldOutLast,
  soldOutMatches,
} from "@/lib/availability";
import GalleryGrid from "@/components/GalleryGrid";
import { siteConfig } from "@/data/siteConfig";

type SortKey = "featured" | "price-desc" | "price-asc" | "name-asc";

function sortProducts(list: Product[], sort: SortKey) {
  return list.slice().sort((a, b) => {
    // Featured is the catalogue's own order, as the page loaded it: sortOrder,
    // set by drag-to-reorder in the admin and, since 28 Sep 2026, by visitor
    // engagement (lib/engagement-rank.ts). It used to regroup by New/Sale/price,
    // which meant the admin order only ever broke ties. New and On Sale still
    // have their own filters; sold-out work still goes last (soldOutLast).
    if (sort === "featured") return 0;
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "name-asc") return a.title.localeCompare(b.title);
    return b.price - a.price; // price-desc
  });
}

function GalleryContent({ products, categories }: { products: Product[]; categories: string[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeCategory = searchParams.get("category");
  const activeSort = (searchParams.get("sort") ?? "featured") as SortKey;
  const searchQuery = searchParams.get("q") ?? "";

  const filtered = soldOutLast(sortProducts(
    products.filter((p) => {
      // Sold-out work is in every view except New and On sale — see
      // lib/availability.ts — and soldOutLast keeps it after everything
      // for sale, whatever the sort.
      if (!matchesAvailability(p, activeCategory)) return false;
      if (activeCategory === "__new__") return !!p.isNew;
      if (activeCategory === "__sale__") return !!p.onSale;
      const matchesCategory =
        !activeCategory || activeCategory === SOLD_OUT_FILTER || p.category === activeCategory;
      const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }),
    activeSort
  ));

  // Sold-out works the current search would have found in a view that leaves
  // them out (New, On sale). Everywhere else they are already in the grid.
  const alsoSoldOut = excludesSoldOut(activeCategory)
    ? soldOutMatches(products, searchQuery)
    : [];

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.replace(`/?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold text-gray-800 mb-2">Welcome to {siteConfig.brand}</h1>
        <p className="text-gray-500 italic text-lg">{siteConfig.tagline}</p>
      </div>

      {/* Search + Filters + Sort — sticky below the nav */}
      <div className="sticky top-[52px] z-40 bg-white border-b border-gray-100 -mx-4 px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          id="gallery-search"
          aria-label="Search paintings"
          placeholder="Search paintings…"
          value={searchQuery}
          onChange={(e) => updateParam("q", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand w-44"
        />

        <label htmlFor="category-filter" className="text-sm text-gray-600 font-medium ml-2">
          Filter:
        </label>
        <select
          id="category-filter"
          value={activeCategory ?? ""}
          onChange={(e) => updateParam("category", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="">All</option>
          <option value="__new__">✦ New Arrivals</option>
          <option value="__sale__">★ On Sale</option>
          <option value={SOLD_OUT_FILTER}>✕ Sold Out</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <label htmlFor="sort-select" className="text-sm text-gray-600 font-medium ml-2">
          Sort:
        </label>
        <select
          id="sort-select"
          value={activeSort}
          onChange={(e) => updateParam("sort", e.target.value === "featured" ? "" : e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="featured">Featured</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="name-asc">Name: A–Z</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div>
          <p className="text-gray-500 text-sm">
            {activeCategory === SOLD_OUT_FILTER
              ? "Nothing in the archive yet."
              : "No paintings match your search."}
          </p>
          {alsoSoldOut.length > 0 && (
            <p className="mt-2 text-sm text-gray-600">
              {alsoSoldOut.length === 1
                ? "One sold-out piece matches: "
                : `${alsoSoldOut.length} sold-out pieces match: `}
              <button
                onClick={() => updateParam("category", SOLD_OUT_FILTER)}
                className="text-brand underline underline-offset-2 hover:no-underline"
              >
                see the archive
              </button>
            </p>
          )}
          <button
            onClick={() => router.replace("/", { scroll: false })}
            className="mt-2 text-sm text-brand hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <GalleryGrid
          heading="Paintings"
          items={filtered}
          soldOutView={activeCategory === SOLD_OUT_FILTER}
          render={(product, priority) => <ProductCard key={product.id} product={product} priority={priority} />}
        />
      )}

      <Testimonial />
      <PressStrip />
    </div>
  );
}

export default function HomeClient({
  products,
  categories,
}: {
  products: Product[];
  categories: string[];
}) {
  return (
    <Suspense fallback={null}>
      <GalleryContent products={products} categories={categories} />
    </Suspense>
  );
}

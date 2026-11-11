"use client";

import { useSearchParams, useRouter } from "next/navigation";
import type { Photograph } from "@/data/photographs";
import type { Product } from "@/data/products";
import ProductCard from "@/components/ProductCard";
import { SOLD_OUT_FILTER, matchesAvailability, soldOutLast } from "@/lib/availability";
import GalleryGrid from "@/components/GalleryGrid";

type SortKey = "featured" | "price-asc" | "price-desc" | "name-asc";

function toProduct(p: Photograph): Product {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    onSale: p.onSale ?? false,
    isNew: p.isNew,
    image: p.image,
    category: p.category,
    sizeType: p.sizeType,
    description: p.description,
    soldOut: p.soldOut,
  };
}

function sortPhotographs(list: Photograph[], sort: SortKey) {
  return list.slice().sort((a, b) => {
    // The catalogue's own order (sortOrder), as for the paintings — see HomeClient.
    if (sort === "featured") return 0;
    if (sort === "price-desc") return b.price - a.price;
    if (sort === "name-asc") return a.title.localeCompare(b.title);
    return a.price - b.price;
  });
}

export default function PhotographsClient({
  photographs,
  categories,
}: {
  photographs: Photograph[];
  categories: string[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeCategory = searchParams.get("category");
  const activeSort = (searchParams.get("sort") ?? "featured") as SortKey;
  const searchQuery = searchParams.get("q") ?? "";

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/photographs?${params.toString()}`, { scroll: false });
  }

  const filtered = soldOutLast(sortPhotographs(
    photographs.filter((p) => {
      // Same rule as the paintings grid: sold-out work follows everything for
      // sale, and has its own view as well.
      if (!matchesAvailability(p, activeCategory)) return false;
      const matchesCategory =
        !activeCategory || activeCategory === SOLD_OUT_FILTER || p.category === activeCategory;
      const matchesSearch = !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }),
    activeSort
  ));

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold text-gray-800 mb-2">Photographs</h1>
        <p className="text-gray-500 italic text-lg">Georgian Bay through the lens</p>
      </div>

      <div className="sticky top-[52px] z-40 bg-white border-b border-gray-100 -mx-4 px-4 py-3 mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          id="photo-search"
          aria-label="Search photographs"
          placeholder="Search photographs…"
          value={searchQuery}
          onChange={(e) => updateParam("q", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand w-44"
        />

        <label htmlFor="photo-category-filter" className="text-sm text-gray-600 font-medium ml-2">Filter:</label>
        <select
          id="photo-category-filter"
          value={activeCategory ?? ""}
          onChange={(e) => updateParam("category", e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="">All</option>
          <option value={SOLD_OUT_FILTER}>✕ Sold Out</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <label htmlFor="photo-sort-select" className="text-sm text-gray-600 font-medium ml-2">Sort:</label>
        <select
          id="photo-sort-select"
          value={activeSort}
          onChange={(e) => updateParam("sort", e.target.value === "featured" ? "" : e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        >
          <option value="featured">Featured</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="name-asc">Name: A–Z</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div>
          <p className="text-gray-500 text-sm">
            {activeCategory === SOLD_OUT_FILTER
              ? "Nothing in the archive yet."
              : "No photographs match your search."}
          </p>
          <button
            onClick={() => router.replace("/photographs", { scroll: false })}
            className="mt-2 text-sm text-brand hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <GalleryGrid
          heading="All photographs"
          items={filtered}
          soldOutView={activeCategory === SOLD_OUT_FILTER}
          render={(photo, priority) => (
            <ProductCard key={photo.id} product={toProduct(photo)} basePath="/photographs" priority={priority} />
          )}
        />
      )}
    </div>
  );
}

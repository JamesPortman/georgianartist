"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isMediaUrl } from "@/lib/private-blob";
import {
  toggleFieldAction,
  deleteProductAction,
  reorderProductsAction,
} from "@/app/actions/admin";

export type AdminProduct = {
  id: string;
  title: string;
  image: string;
  category: string;
  onSale: boolean;
  isNew: boolean;
  soldOut: boolean;
  visible: boolean;
  inspirationImage: string | null;
};

// "default" = visible first, then title A–Z (the initial view). "manual" = the
// saved drag order. The rest are single-column sorts via the header buttons.
type SortKey = "default" | "manual" | "title" | "category" | "onSale" | "isNew" | "soldOut" | "visible";
type SortDir = "asc" | "desc";

export default function ProductTableClient({
  title,
  products,
}: {
  title: string;
  products: AdminProduct[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(products);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pending, startTransition] = useTransition();

  // Keep local state in sync if the server sends a fresh list.
  if (
    products.length !== rows.length ||
    products.some((p, i) => p.id !== rows[i]?.id || p.visible !== rows[i]?.visible ||
      p.onSale !== rows[i]?.onSale || p.isNew !== rows[i]?.isNew ||
      p.soldOut !== rows[i]?.soldOut)
  ) {
    // Only resync when not mid-drag to avoid clobbering an in-progress reorder.
    if (dragIndex === null) setRows(products);
  }

  // "manual" = the drag order (drives the live site). Column sorts and the
  // default view are view-only conveniences and don't change the saved order.
  const isManual = sortKey === "manual";
  const displayed = isManual
    ? rows
    : [...rows].sort((a, b) => {
        if (sortKey === "default") {
          // Visible first, then title A–Z.
          const v = (b.visible ? 1 : 0) - (a.visible ? 1 : 0);
          return v !== 0 ? v : a.title.localeCompare(b.title);
        }
        let c = 0;
        if (sortKey === "title") c = a.title.localeCompare(b.title);
        else if (sortKey === "category") c = a.category.localeCompare(b.category);
        else {
          const k = sortKey as "onSale" | "isNew" | "soldOut" | "visible";
          c = (a[k] ? 1 : 0) - (b[k] ? 1 : 0);
        }
        return sortDir === "asc" ? c : -c;
      });

  function onSort(key: Exclude<SortKey, "manual">) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggle(id: string, field: "visible" | "isNew" | "onSale" | "soldOut", value: boolean) {
    setRows((r) => r.map((p) => (p.id === id ? { ...p, [field]: !value } : p)));
    startTransition(async () => {
      await toggleFieldAction(id, field, !value);
      router.refresh();
    });
  }

  function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This permanently removes the product and its image.`)) return;
    setRows((r) => r.filter((p) => p.id !== id));
    startTransition(async () => {
      await deleteProductAction(id);
      router.refresh();
    });
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...rows];
    const [moved] = next.splice(dragIndex, 1);
    if (moved) next.splice(targetIndex, 0, moved);
    setRows(next);
    setDragIndex(null);
    startTransition(async () => {
      await reorderProductsAction(next.map((p) => p.id));
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        {title} <span className="text-gray-400 font-normal">({rows.length})</span>
        {pending && <span className="ml-2 text-xs text-gray-400 normal-case">saving…</span>}
        {sortKey === "default" && (
          <span className="ml-2 text-xs text-gray-400 normal-case">
            visible first, then title; click ⠿ to drag-reorder
          </span>
        )}
        {!isManual && sortKey !== "default" && (
          <span className="ml-2 text-xs text-gray-400 normal-case">
            sorted view; click ⠿ to return to manual order for reordering
          </span>
        )}
      </h2>

      <div className="bg-white rounded-lg shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-[60px] z-20 border-b border-gray-200 shadow-sm [&>tr>th]:bg-gray-50 [&>tr>th:first-child]:rounded-tl-lg [&>tr>th:last-child]:rounded-tr-lg">
            <tr>
              <th className="w-8 text-center">
                <button
                  type="button"
                  onClick={() => setSortKey("manual")}
                  title="Manual order: drag rows to reorder how they appear on the site"
                  className={isManual ? "text-brand" : "text-gray-300 hover:text-gray-500"}
                >
                  ⠿
                </button>
              </th>
              <th className="text-left px-3 py-3 font-medium text-gray-600 w-16">Image</th>
              <SortHeader label="Title" k="title" align="left" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Category" k="category" align="left" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Sale" k="onSale" align="center" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="New" k="isNew" align="center" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Sold" k="soldOut" align="center" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortHeader label="Visible" k="visible" align="center" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayed.map((p, i) => (
              <tr
                key={p.id}
                draggable={isManual}
                onDragStart={isManual ? () => setDragIndex(i) : undefined}
                onDragOver={isManual ? (e) => e.preventDefault() : undefined}
                onDrop={isManual ? () => onDrop(i) : undefined}
                className={`hover:bg-gray-50 ${!p.visible ? "opacity-50" : ""} ${
                  dragIndex === i ? "opacity-30" : ""
                }`}
              >
                {/* Drag handle (only active in manual order) */}
                <td
                  className={`pl-3 select-none ${isManual ? "text-gray-300 cursor-grab" : "text-gray-200 cursor-default"}`}
                  title={isManual ? "Drag to reorder" : "Click the ⠿ header to return to manual order"}
                >
                  ⠿
                </td>

                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <div className="relative w-12 h-9 bg-gray-100 rounded overflow-hidden">
                      <Image src={p.image} alt={p.title} fill className="object-cover" sizes="48px" unoptimized={isMediaUrl(p.image)} />
                    </div>
                    {p.inspirationImage && (
                      <div
                        className="relative w-9 h-9 bg-gray-100 rounded overflow-hidden ring-1 ring-brand/40"
                        title="Inspiration photo"
                      >
                        <Image
                          src={p.inspirationImage}
                          unoptimized={isMediaUrl(p.inspirationImage)}
                          alt="inspiration"
                          fill
                          className="object-cover"
                          sizes="36px"
                        />
                        <span className="absolute bottom-0 left-0 right-0 bg-black/55 text-white text-[8px] leading-tight text-center">
                          insp
                        </span>
                      </div>
                    )}
                  </div>
                </td>

                <td className="px-4 py-2">
                  <p className="font-medium text-gray-800 truncate max-w-xs">{p.title}</p>
                  <p className="text-xs text-gray-400">{p.id}</p>
                </td>

                <td className="px-4 py-2 text-gray-600">{p.category}</td>

                <td className="px-3 py-2 text-center">
                  <Toggle on={p.onSale} field="onSale" onClick={() => toggle(p.id, "onSale", p.onSale)} />
                </td>
                <td className="px-3 py-2 text-center">
                  <Toggle on={p.isNew} field="isNew" onClick={() => toggle(p.id, "isNew", p.isNew)} />
                </td>
                <td className="px-3 py-2 text-center">
                  <Toggle on={p.soldOut} field="soldOut" onClick={() => toggle(p.id, "soldOut", p.soldOut)} />
                </td>
                <td className="px-3 py-2 text-center">
                  <Toggle on={p.visible} field="visible" onClick={() => toggle(p.id, "visible", p.visible)} />
                </td>

                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="text-brand hover:underline font-medium text-xs"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => remove(p.id, p.title)}
                    className="ml-3 text-red-600 hover:underline font-medium text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortHeader({
  label,
  k,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: Exclude<SortKey, "manual">;
  align: "left" | "center";
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: Exclude<SortKey, "manual">) => void;
}) {
  const active = sortKey === k;
  return (
    <th className={`${align === "left" ? "text-left px-4" : "text-center px-3"} py-3`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 font-medium hover:text-gray-900 ${
          active ? "text-gray-900" : "text-gray-600"
        }`}
        title={`Sort by ${label}`}
      >
        {label}
        <span className="text-[10px] text-brand">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

/**
 * `field` is not decoration. These switches were identical to each other and
 * to a screen reader — every one announced "Click to disable" with no clue
 * what it governed — so the e2e suite reached them by column position
 * (`.nth(2)`). Adding a column silently repointed that index at the wrong
 * switch, and the visibility test started driving the new one instead. Naming
 * them fixes the accessibility gap and the coupling at once.
 */
function Toggle({
  on,
  field,
  onClick,
}: {
  on: boolean;
  field: "onSale" | "isNew" | "soldOut" | "visible";
  onClick: () => void;
}) {
  const label = { onSale: "Sale", isNew: "New", soldOut: "Sold out", visible: "Visible" }[field];
  return (
    <button
      type="button"
      onClick={onClick}
      data-field={field}
      aria-pressed={on}
      aria-label={`${label}, ${on ? "click to disable" : "click to enable"}`}
      title={on ? "Click to disable" : "Click to enable"}
      className={`w-8 h-5 rounded-full transition-colors relative ${
        on ? "bg-brand" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

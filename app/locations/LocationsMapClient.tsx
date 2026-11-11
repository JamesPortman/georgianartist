"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import { BRAND } from "@/lib/brand";
import { escapeHtml } from "@/lib/escape-html";
import { filmHref } from "@/lib/film-links";
import { productPath } from "@/lib/product-path";

export type Place = {
  id: string;
  slug?: string | null;
  title: string;
  type: string;
  category: string;
  lat: number;
  lng: number;
  /** The work's making-of film, when it has one. */
  filmId: string | null;
};

/** One map pin: every work made at the same spot. */
type Location = {
  key: string;
  lat: number;
  lng: number;
  category: string;
  /** The distinct titles here, e.g. "Autumn Canopy · Top of Blue Mountain". */
  label: string;
  works: Place[];
};

const PAINTING = "#b45309";
const PHOTO = BRAND.green;

const href = (p: Place) => productPath(p);

/**
 * Collapse works that share a spot into one pin.
 *
 * A painting made from one of the photographs inherits that photo's
 * coordinates exactly, so before this the two sat as separate markers stacked
 * pixel-on-pixel — the map looked like it had twice as many places as it does,
 * and every one of them was listed twice underneath.
 *
 * 4 decimal places is ~11m: close enough to merge a painting with its source
 * photo, far enough apart to keep genuinely different spots separate (Blue
 * Mountain Sunrise and Sunset are ~150m apart and stay two pins).
 */
function groupByLocation(places: Place[]): Location[] {
  // Never empty: a key exists only once a place is filed under it.
  const byKey = new Map<string, [Place, ...Place[]]>();
  for (const p of places) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const works = byKey.get(key);
    if (works) works.push(p);
    else byKey.set(key, [p]);
  }
  return [...byKey.entries()]
    .map(([key, works]) => ({
      key,
      lat: works[0].lat,
      lng: works[0].lng,
      category: works[0].category,
      label: [...new Set(works.map((w) => w.title))].join(" · "),
      works,
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
}

function pinColour(works: Place[]) {
  const hasPhoto = works.some((w) => w.type === "photograph");
  const hasPainting = works.some((w) => w.type !== "photograph");
  if (hasPhoto && hasPainting) return `linear-gradient(90deg, ${PAINTING} 50%, ${PHOTO} 50%)`;
  return hasPhoto ? PHOTO : PAINTING;
}

export default function LocationsMapClient({
  places,
  focusWork,
}: {
  places: Place[];
  /** A work id whose pin opens on load (?work=, from a film on /making-of). */
  focusWork?: string;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const locations = useMemo(() => groupByLocation(places), [places]);

  useEffect(() => {
    if (!holder.current || !locations.length) return;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    // Leaflet touches window, so it's imported only in the browser.
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !holder.current) return;

      map = L.map(holder.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      const markers = locations.map((loc) => {
        const many = loc.works.length > 1;
        const size = many ? 20 : 14;
        const marker = L.marker([loc.lat, loc.lng], {
          title: loc.label,
          icon: L.divIcon({
            className: "",
            html:
              `<span class="flex items-center justify-center rounded-full border-2 border-white shadow-md text-white font-semibold" ` +
              `style="width:${size}px;height:${size}px;font-size:10px;line-height:1;background:${pinColour(loc.works)}">` +
              `${many ? loc.works.length : ""}</span>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        });
        // Leaflet sets the popup as HTML, so every value from the database is
        // escaped: a title is the admin's text, not markup (security review,
        // October 2026).
        marker.bindPopup(
          loc.works
            .map(
              (w) =>
                `<a href="${escapeHtml(href(w))}" style="color:${BRAND.green};font-weight:600;text-decoration:none">${escapeHtml(w.title)}</a>` +
                `<span style="color:#6b7280;font-size:12px"> · ${escapeHtml(w.type)}</span>` +
                (w.filmId
                  ? `<span style="color:#6b7280;font-size:12px"> · </span>` +
                    `<a href="${escapeHtml(filmHref(w.filmId))}" data-film style="color:${BRAND.green};font-size:12px">watch it being made</a>`
                  : "")
            )
            .join("<br/>") + `<br/><span style="color:#6b7280;font-size:12px">${escapeHtml(loc.category)}</span>`
        );
        marker.on("click", () => setActive(loc.key));
        return marker;
      });

      const group = L.featureGroup(markers).addTo(map);
      // Arriving from a film: start on that work's pin, popup open. An unknown
      // or hidden id falls back to the whole collection.
      const target = focusWork
        ? locations.findIndex((loc) => loc.works.some((w) => w.id === focusWork))
        : -1;
      const loc = target >= 0 ? locations[target] : undefined;
      if (loc) {
        map.setView([loc.lat, loc.lng], 13);
        markers[target]?.openPopup();
        setActive(loc.key);
      } else {
        map.fitBounds(group.getBounds(), { padding: [40, 40] });
      }
      // Keep a reference so the list can drive the map
      const el = holder.current as HTMLDivElement & { _map?: unknown; _markers?: unknown };
      el._map = map;
      el._markers = Object.fromEntries(locations.map((loc, i) => [loc.key, markers[i]]));
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [locations, focusWork]);

  function focus(loc: Location) {
    const el = holder.current as
      | (HTMLDivElement & { _map?: import("leaflet").Map; _markers?: Record<string, import("leaflet").Marker> })
      | null;
    if (!el?._map || !el._markers) return;
    setActive(loc.key);
    el._map.setView([loc.lat, loc.lng], 13, { animate: true });
    el._markers[loc.key]?.openPopup();
  }

  const paintings = places.filter((p) => p.type !== "photograph").length;
  const photos = places.filter((p) => p.type === "photograph").length;
  // Only MIXED places, because that is what the swatch beside it shows. Two
  // paintings can now share a spot too (a painting and the photograph it was
  // made from are not the only way to collide), and counting those as "Both"
  // made the legend claim more mixed pins than the map had.
  const isMixed = (l: Location) =>
    l.works.some((w) => w.type === "photograph") && l.works.some((w) => w.type !== "photograph");
  const shared = locations.filter(isMixed).length;

  return (
    <>
      <div
        ref={holder}
        className="w-full h-[60vh] min-h-[380px] rounded-sm overflow-hidden border border-gray-200 bg-gray-100 z-0"
        role="application"
        aria-label="Map of the places behind the collection"
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-[#b45309] border-2 border-white shadow" />
          Paintings ({paintings})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-brand border-2 border-white shadow" />
          Photographs ({photos})
        </span>
        {shared > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full border-2 border-white shadow"
              style={{ background: `linear-gradient(90deg, ${PAINTING} 50%, ${PHOTO} 50%)` }}
            />
            Both, at {shared} {shared === 1 ? "place" : "places"}
          </span>
        )}
        <span className="ml-auto hidden sm:inline">Scroll-zoom is off: pinch or use the +/− buttons.</span>
      </div>

      {/* Text list: works without JS, and doubles as the map's index. One row
          per pin, so it stays in step with the map. */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mt-10 mb-3">
        {locations.length} places
      </h2>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2">
        {locations.map((loc) => (
          <li key={loc.key} className="text-sm">
            <button
              onClick={() => focus(loc)}
              className={`text-left hover:underline ${
                active === loc.key ? "text-brand font-semibold" : "text-gray-700"
              }`}
            >
              {loc.label}
            </button>
            <span className="text-gray-500"> · {loc.category} · </span>
            {loc.works.map((w, i) => (
              <span key={w.id}>
                {i > 0 && <span className="text-gray-300"> / </span>}
                <Link href={href(w)} className="text-brand underline underline-offset-2 hover:no-underline">
                  {w.type === "photograph" ? "photograph" : "painting"}
                </Link>
              </span>
            ))}
            {loc.works
              .filter((w) => w.filmId)
              .map((w) => (
                <span key={`film-${w.id}`}>
                  <span className="text-gray-300"> / </span>
                  <Link
                    href={filmHref(w.filmId!)}
                    data-film
                    className="text-brand underline underline-offset-2 hover:no-underline"
                  >
                    film
                  </Link>
                </span>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}

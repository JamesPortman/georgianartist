import type { Metadata } from "next";
import Link from "next/link";
import LocationsMapClient, { type Place } from "./LocationsMapClient";
import { siteConfig } from "@/data/siteConfig";
import { catalogue } from "@/lib/catalogue-cache";

export const metadata: Metadata = {
  title: `Locations | ${siteConfig.brand}`,
  description:
    "Every painting and photograph in the collection is rooted in a real place. See them all on a map of Georgian Bay, the Blue Mountains, the Bruce Peninsula and beyond.",
  alternates: { canonical: "/locations" },
};

export const dynamic = "force-dynamic";

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ work?: string | string[] }>;
}) {
  // ?work=<id> opens that work's pin: how a film on /making-of links to the
  // place it was painted.
  const { work } = await searchParams;
  const rows = await catalogue.product.findMany({
    where: { visible: true, inspirationLat: { not: null }, inspirationLng: { not: null } },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true, slug: true, type: true, title: true, category: true,
      inspirationLat: true, inspirationLng: true,
    },
  });

  // The films of the works on the map, so a pin can link back to its film.
  const films = await catalogue.makingOf.findMany({
    where: { visible: true, productId: { in: rows.map((r) => r.id) } },
    select: { id: true, productId: true },
  });
  const filmFor = new Map(films.map((f) => [f.productId!, f.id]));

  const places: Place[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    type: r.type,
    title: r.title,
    category: r.category,
    lat: r.inspirationLat!,
    lng: r.inspirationLng!,
    filmId: filmFor.get(r.id) ?? null,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-800 mb-2">Locations</h1>
      <p className="text-gray-600 leading-relaxed max-w-2xl mb-8">
        Every piece is rooted in a real place: a beach, a bend in the Beaver River, a trail along
        the escarpment. Here is where {places.length} of them were made, from the Blue Mountains and
        the Beaver Valley out to Manitoulin and the tip of the Bruce Peninsula. Where a painting and
        the photograph behind it share a spot, they share a pin.
      </p>

      {places.length > 0 ? (
        <LocationsMapClient places={places} focusWork={typeof work === "string" ? work : undefined} />
      ) : (
        <p className="text-gray-500">No locations recorded yet.</p>
      )}

      <p className="text-sm text-gray-500 mt-10">
        Paintings begin as a photograph of the spot; the pin marks where that photo was taken.{" "}
        <Link href="/about" className="text-brand underline underline-offset-2 hover:no-underline">
          More about the work
        </Link>
        .
      </p>
    </div>
  );
}

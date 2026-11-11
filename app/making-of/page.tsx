import { catalogue } from "@/lib/catalogue-cache";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getMakingOfFilms } from "@/lib/making-of";
import MakingOfVideo from "@/components/MakingOfVideo";
import { siteConfig } from "@/data/siteConfig";
import { filmAnchor, locationHref } from "@/lib/film-links";
import { productPath } from "@/lib/product-path";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Making Of | ${siteConfig.brand}`,
  description:
    "Short films of Georgian Bay paintings building up stroke by stroke, from blank canvas to finished work.",
  alternates: { canonical: "/making-of" },
};


export default async function MakingOfPage() {
  const films = await getMakingOfFilms();

  // Films can name a work that isn't in the catalogue yet, so only the ones
  // whose product actually exists (and is visible) get a link.
  const ids = films.map((f) => f.productId).filter((v): v is string => !!v);
  const products = ids.length
    ? await catalogue.product.findMany({
        where: { id: { in: ids }, visible: true },
        select: { id: true, slug: true, type: true, inspirationLat: true, inspirationLng: true },
      })
    : [];
  // The works with a pin on the Locations map (the same test that page uses).
  const onMap = new Set(
    products.filter((p) => p.inspirationLat != null && p.inspirationLng != null).map((p) => p.id)
  );
  const hrefById = new Map(
    products.map((p) => [p.id, productPath(p)])
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-800 mb-2">Making Of</h1>
      <p className="text-gray-500 italic text-lg mb-10">
        Georgian Bay, one brushstroke at a time.
      </p>

      <p className="text-gray-700 leading-relaxed mb-10">
        Each of these is a painting building itself up from a blank canvas to the finished work.
        They run under a minute each, and nothing downloads until you press play.
      </p>

      <div className="text-gray-700 leading-relaxed mb-10 space-y-4">
        <p>
          Every piece starts from a photograph {siteConfig.artist} took of a real place around
          Georgian Bay.
        </p>
        <p>
          The style owes a debt to the Post-Impressionists, with directional strokes that follow
          the curl of a cloud or the run of a wave, and colour pushed a little past what the camera
          saw, in the saturated autumn palette this stretch of Ontario is known for.
        </p>
        <p>
          The painting itself is made in Rebelle, digital painting software that reproduces how
          real paint behaves: oil that thickens and holds the mark of the bristles, wet colour that
          blends where strokes meet, and layers that dry and build on one another. The strokes
          usually go down the way an oil painter works, with a thin dark ground, the dark masses
          laid in first and the brightest accents last. A time-lapse recording captures the whole
          process, and after a final finishing pass, the last frame of each film is the finished
          print.
        </p>
      </div>

      {films.length === 0 ? (
        <p className="text-gray-500">No films published yet. Check back soon.</p>
      ) : (
        <>
          {/* Thumbnail index — jumps down to the film without loading any video.
              The poster is the finished painting, so this doubles as a contact
              sheet of the whole series. */}
          <nav aria-label="All films" className="mb-14">
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              All {films.length} films
            </h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4 list-none p-0 m-0">
              {films.map((film) => (
                <li key={film.id}>
                  <Link
                    href={`#${filmAnchor(film.id)}`}
                    className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm border border-gray-200 bg-gray-100">
                      {film.posterUrl ? (
                        <Image
                          src={film.posterUrl}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 45vw, 240px"
                          className="object-cover transition-opacity group-hover:opacity-85"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
                          No still yet
                        </span>
                      )}
                    </div>
                    <span className="mt-2 block text-xs leading-snug text-gray-600 group-hover:text-brand">
                      {film.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-14">
            {films.map((film) => {
              const href = film.productId ? hrefById.get(film.productId) : undefined;
              return (
                <article key={film.id} id={filmAnchor(film.id)} className="scroll-mt-20">
                  <div className="flex items-baseline justify-between gap-4 mb-3">
                    <h2 className="text-xl font-semibold text-gray-800">
                      {href ? (
                        <Link href={href} className="text-gray-800 hover:text-brand">
                          {film.title}
                        </Link>
                      ) : (
                        film.title
                      )}
                    </h2>
                    {film.seconds ? (
                      <span className="text-xs text-gray-500 shrink-0">{film.seconds} seconds</span>
                    ) : null}
                  </div>

                  <MakingOfVideo film={{ ...film, productId: null }} heading={null} />

                  {(href || (film.productId && onMap.has(film.productId))) && (
                    <p className="text-sm mt-3 flex flex-wrap gap-x-6 gap-y-1">
                      {href && (
                        <Link href={href} className="text-brand hover:underline font-medium">
                          See the finished print →
                        </Link>
                      )}
                      {film.productId && onMap.has(film.productId) && (
                        <Link
                          href={locationHref(film.productId)}
                          className="text-brand hover:underline font-medium"
                        >
                          See the spot on the map →
                        </Link>
                      )}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

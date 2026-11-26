import { catalogue } from "@/lib/catalogue-cache";
import type { MakingOfFilm } from "@/components/MakingOfVideo";

const select = {
  id: true,
  title: true,
  videoUrl: true,
  posterUrl: true,
  description: true,
  seconds: true,
  productId: true,
} as const;

/** The film for one work, or null when that work doesn't have one. */
export async function getMakingOfForProduct(productId: string): Promise<MakingOfFilm | null> {
  return catalogue.makingOf.findFirst({ where: { productId, visible: true }, select });
}

/**
 * Whether any film is showing. When none is (each can be hidden in the admin),
 * the Making Of link leaves the menu, the About page and the sitemap.
 */
export async function hasMakingOfFilms(): Promise<boolean> {
  // Not during `next build`: the pages it prerenders share the root layout, so
  // the answer would go into the data cache from whatever the database held at
  // build time and be served for an hour after. CI builds before it seeds, so
  // that answer was "none", and the running site had no Making Of link.
  if (process.env.NEXT_PHASE === "phase-production-build") return true;
  return (await catalogue.makingOf.findFirst({ where: { visible: true }, select: { id: true } })) !== null;
}

/**
 * Titles A to Z, ignoring case and accents, the way a reader expects. Sorted
 * here rather than by the query: a database orders text by its collation,
 * which differs between CI's Postgres and Neon.
 */
export function byTitle<T extends { title: string }>(films: T[]): T[] {
  return [...films].sort((a, b) =>
    a.title.localeCompare(b.title, "en", { sensitivity: "base", numeric: true })
  );
}

/** Every published film, alphabetically by title (owner's choice, Nov 2026). */
export async function getMakingOfFilms(): Promise<MakingOfFilm[]> {
  return byTitle(
    await catalogue.makingOf.findMany({
      where: { visible: true },
      select,
    })
  );
}

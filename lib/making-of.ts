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

/** Every published film, in the order set on the records. */
export async function getMakingOfFilms(): Promise<MakingOfFilm[]> {
  return catalogue.makingOf.findMany({
    where: { visible: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select,
  });
}

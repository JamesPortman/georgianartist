import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Cached catalogue reads for the pages visitors see.
 *
 * Every page renders per request, because the root layout reads the CSP nonce
 * the proxy sets (prerendering would mean giving that policy up), so before
 * this every visit queried Neon. On the Free plan Neon suspends after five
 * idle minutes, and the first visitor after a quiet spell waited for it to wake.
 * Now a page's catalogue reads come from Next's data cache, and Neon is only
 * asked when something has changed:
 *
 *   - every admin write calls updateTag(CATALOGUE_TAG) (app/actions/admin.ts),
 *     so the admin sees the change on the next load;
 *   - anything that writes without the admin (scripts/, a cron, Neon console)
 *     shows within CATALOGUE_TTL, when the entry expires on its own, or at
 *     once when the owner presses "Refresh site" in the admin
 *     (refreshCatalogueAction);
 *   - every deployment starts with an empty cache: the deployment id is part of
 *     each key (cacheKey). Next's data cache outlives a deploy, so without it a
 *     new build served the previous one's reads for up to an hour. On 7 Oct 2026
 *     that meant image paths the new build had just deleted.
 *
 * Use `catalogue.<model>.<method>` exactly like `prisma`, but ONLY for public
 * reads. Anything that decides what to write, or must see a change at once (the
 * admin, crons, the Instagram publisher, slug checks, /media's visibility test),
 * reads `prisma` directly.
 *
 * unstable_cache stores results as JSON, so Dates come back as strings; they
 * are revived here for every key ending in "At" (createdAt, updatedAt, …).
 */

import { CATALOGUE_TAG } from "@/lib/catalogue-tag";
export { CATALOGUE_TAG };
/** Seconds before a cached read refreshes on its own: the delay for script edits. */
export const CATALOGUE_TTL = 60 * 60;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** Turn JSON-roundtripped date strings back into Dates, for keys ending in "At". */
export function reviveDates<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reviveDates) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        k.endsWith("At") && typeof v === "string" && ISO.test(v) ? new Date(v) : reviveDates(v),
      ])
    ) as T;
  }
  return value;
}

/** The cache key for a query: scoped to this deployment, so a new build never reads an old one's entries. */
export function cacheKey(
  name: string,
  deployment = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || ""
): string[] {
  return ["catalogue", name, deployment];
}

function cached<A, R>(name: string, query: (args: A) => Promise<R>) {
  // Built on first use, not at import: modules that only import a neighbour of
  // this (product-lookup's slugTakenBy, from the admin) never touch the cache.
  let fn: ((args: A) => Promise<R>) | null = null;
  return async (args: A): Promise<R> => {
    fn ??= unstable_cache(query, cacheKey(name), { tags: [CATALOGUE_TAG], revalidate: CATALOGUE_TTL });
    try {
      return reviveDates(await fn(args));
    } catch (e) {
      // Outside a Next server (unit tests, tsx scripts) there is no data cache
      // to read from; query directly. Any other error is real.
      if (e instanceof Error && e.message.includes("incrementalCache missing")) return query(args);
      throw e;
    }
  };
}

const productFindMany = cached("product.findMany", (a: Prisma.ProductFindManyArgs) => prisma.product.findMany(a));
const productFindFirst = cached("product.findFirst", (a: Prisma.ProductFindFirstArgs) => prisma.product.findFirst(a));
const makingOfFindMany = cached("makingOf.findMany", (a: Prisma.MakingOfFindManyArgs) => prisma.makingOf.findMany(a));
const makingOfFindFirst = cached("makingOf.findFirst", (a: Prisma.MakingOfFindFirstArgs) => prisma.makingOf.findFirst(a));
const slugFindUnique = cached("productSlug.findUnique", (a: Prisma.ProductSlugFindUniqueArgs) => prisma.productSlug.findUnique(a));

/** The cached, read-only twin of `prisma` for public pages (see above). */
export const catalogue = {
  product: {
    findMany: <T extends Prisma.ProductFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.ProductFindManyArgs>) =>
      productFindMany(args as Prisma.ProductFindManyArgs) as unknown as Promise<Prisma.ProductGetPayload<T>[]>,
    findFirst: <T extends Prisma.ProductFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.ProductFindFirstArgs>) =>
      productFindFirst(args as Prisma.ProductFindFirstArgs) as unknown as Promise<Prisma.ProductGetPayload<T> | null>,
  },
  makingOf: {
    findMany: <T extends Prisma.MakingOfFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.MakingOfFindManyArgs>) =>
      makingOfFindMany(args as Prisma.MakingOfFindManyArgs) as unknown as Promise<Prisma.MakingOfGetPayload<T>[]>,
    findFirst: <T extends Prisma.MakingOfFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.MakingOfFindFirstArgs>) =>
      makingOfFindFirst(args as Prisma.MakingOfFindFirstArgs) as unknown as Promise<Prisma.MakingOfGetPayload<T> | null>,
  },
  productSlug: {
    findUnique: <T extends Prisma.ProductSlugFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.ProductSlugFindUniqueArgs>) =>
      slugFindUnique(args as Prisma.ProductSlugFindUniqueArgs) as unknown as Promise<Prisma.ProductSlugGetPayload<T> | null>,
  },
};

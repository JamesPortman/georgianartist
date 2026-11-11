/**
 * Where a work lives on the site.
 *
 * A product's `id` is permanent: Blob filenames, analytics, Instagram posts,
 * films and the admin all key on it. Its URL is `slug`, which can change: a
 * retitled work can take a new address while its old one keeps redirecting
 * (`ProductSlug`, lib/product-lookup.ts). A null slug means the id is the
 * slug, which is every work that has never been renamed.
 *
 * Build every link to a work with productPath(), never from `id`: a link built
 * from the id still works after a rename, but only through a redirect.
 */

export type Pathable = { id: string; type: string; slug?: string | null };

/** The slug a work is served at. */
export const productSlug = (p: { id: string; slug?: string | null }): string => p.slug ?? p.id;

/** "/products/<slug>" or "/photographs/<slug>". */
export const productPath = (p: Pathable): string =>
  `${p.type === "photograph" ? "/photographs" : "/products"}/${productSlug(p)}`;

/** Lowercase words joined by single hyphens: what slugify() produces. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;

/** Null when the slug is well-formed, otherwise what's wrong with it. */
export function slugProblem(slug: string): string | null {
  if (!slug) return "The URL slug can't be empty.";
  if (slug.length > SLUG_MAX) return `The URL slug can be at most ${SLUG_MAX} characters.`;
  if (!SLUG_PATTERN.test(slug)) {
    return "The URL slug can only use lowercase letters, digits and single hyphens, e.g. lora-bay-at-dawn.";
  }
  return null;
}

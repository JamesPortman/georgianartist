/**
 * The cache tag on every public catalogue read (lib/catalogue-cache.ts). In a
 * module of its own so the admin's actions can expire it without importing
 * the cache itself.
 */
export const CATALOGUE_TAG = "catalogue";

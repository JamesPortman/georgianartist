/**
 * Links between a work's making-of film and its pin on the Locations map, in
 * both directions. Kept free of imports so the map (a client component) and
 * the Making Of page (a server one) build the same URLs.
 */

/** The id of a film's section on /making-of. */
export const filmAnchor = (filmId: string) => `film-${filmId}`;

/** Straight to one film on /making-of. */
export const filmHref = (filmId: string) => `/making-of#${filmAnchor(filmId)}`;

/** The Locations map, zoomed to this work's pin with its popup open. */
export const locationHref = (productId: string) => `/locations?work=${encodeURIComponent(productId)}`;

/**
 * The site-wide link preview image: where it lives, and how big it actually is.
 *
 * The dimensions are here rather than typed into `app/layout.tsx` because the
 * tag and the bytes have to agree, and they did not. The tag advertised 1200
 * wide with no height while the route served a 2400 x 1201, 1.5MB painting,
 * and LinkedIn refused to build a card from it about half the time. A crawler
 * told one size and handed another is entitled to give up, and when it does
 * the failure is invisible from inside the site — every page still renders,
 * the link just shares as a blank rectangle.
 *
 * 1.91:1 is the ratio LinkedIn, Facebook and X all use to choose the large
 * card over the small one.
 */
export const OG_IMAGE_PATH = "/api/og-image";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 627;
export const OG_IMAGE_TYPE = "image/jpeg";

/**
 * How long to wait for the source image before giving up on it.
 *
 * Without a bound, a stalled source never fails — the request simply runs to
 * the platform's maximum duration and the crawler is handed a 504. That is
 * worse than the plain redirect this route replaced, because at least the
 * redirect answered instantly. Five seconds is generous for a same-origin or
 * Blob fetch and still well inside what a scraper will sit through.
 */
export const OG_SOURCE_TIMEOUT_MS = 5_000;

/**
 * What fills the space around a work that is not 1.91:1.
 *
 * Almost nothing in the catalogue is: "Bruce Trail" is 1799x2400 and "Inglis
 * Falls" is square. Cropping them to the card's ratio throws away 61% and 48%
 * of the image respectively, so a shared link showed the middle band of a
 * painting. The work is letterboxed onto this instead, which is the same
 * choice prepareImageForInstagram makes for the same reason.
 *
 * #fafafa is the site's own page background, so the card reads as a continuation
 * of the site rather than as a photo with white bars stuck on it.
 */
export const OG_CARD_BACKGROUND = { r: 250, g: 250, b: 250, alpha: 1 };

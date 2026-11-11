/**
 * Per-image merchandise — alternate formats of the same source image.
 * These are the "Also available as" / "Frame this?" options shown on
 * each painting and photograph detail page.
 *
 * Multi-image products (calendars, card packs, photo books) live in
 * /gift-shop and have their own definitions in data/giftShop.ts.
 */

// Frame pricing varies by canvas size + frame type — we collect a quote
// request from the customer rather than charging a flat uplift.
export const GREETING_CARD_SINGLE_CAD = 8;
export const POSTCARD_SINGLE_CAD = 4;

export type MerchandiseFormat =
  | "canvas"
  | "canvas-framed"
  | "greeting-card"
  | "postcard";

/** A human-readable label sent to Resend so James can fulfill the order. */
export function formatLabel(format: MerchandiseFormat): string {
  switch (format) {
    case "canvas":
      return "Canvas print";
    case "canvas-framed":
      return "Framed canvas print";
    case "greeting-card":
      return "Greeting card";
    case "postcard":
      return "Postcard";
  }
}

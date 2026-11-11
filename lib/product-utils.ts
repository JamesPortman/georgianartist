import { sizeOptions } from "@/data/products";

/**
 * Map an image's aspect ratio to a size type.
 * If `available` is given, the guess is validated against it (falls back to
 * the first available type).
 */
export function deriveSizeType(width: number, height: number, available?: string[]): string {
  const r = width / height;
  let guess: string;
  // 2.3 sits between the true 2:1 panoramas (2.00) and the two extra-wide
  // paintings (2.44, 2.49), so neither group is misclassified.
  if (r >= 2.3) guess = "ultrawide";
  else if (r >= 1.8) guess = "panoramic";
  else if (r >= 1.15) guess = "landscape";
  else if (r >= 0.87) guess = "square";
  else guess = "portrait";
  if (available && !available.includes(guess)) return available[0] ?? guess;
  return guess;
}

/**
 * Lowest sale price for a size type — the product's "from" base price — or 0
 * for an unknown one. Own keys only: "valueOf" or "__proto__" used to reach
 * Object.prototype and throw (found by __tests__/properties.test.ts).
 */
export function standardPrice(sizeType: string): number {
  if (!Object.hasOwn(sizeOptions, sizeType)) return 0;
  return Math.min(...sizeOptions[sizeType as keyof typeof sizeOptions].map((o) => o.salePrice));
}

/**
 * Turn a title into a URL-safe slug (id). Does not guarantee uniqueness.
 * Hyphens are trimmed after the 60-character cut: a cut just after a word
 * used to leave a trailing hyphen, a slug slugProblem() refuses (found by
 * __tests__/properties.test.ts).
 */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60)
      .replace(/^-+|-+$/g, "") || "product"
  );
}

/** Inches to whole centimetres, as a print shop would quote them. */
export function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54);
}

/**
 * A size label with its metric equivalent: `12" × 16" (30 × 41 cm)`.
 * Labels are height × width, so the centimetres follow the same order. A label
 * that already ends in brackets keeps them inside the one pair:
 * `16" × 32" (41 × 81 cm, 2 panels)`. Display only: orders are keyed on the
 * label itself, which stays in inches.
 */
export function sizeLabelWithCm(size: { label: string; width: number; height: number }): string {
  const cm = `${inchesToCm(size.height)} × ${inchesToCm(size.width)} cm`;
  const note = size.label.match(/^(.*) \((.+)\)$/);
  return note ? `${note[1]} (${cm}, ${note[2]})` : `${size.label} (${cm})`;
}

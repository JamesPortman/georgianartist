/**
 * The brand colours, as JavaScript strings.
 *
 * Almost everything on the site colours itself with Tailwind classes —
 * `bg-brand`, `text-brand`, `hover:bg-brand-hover` — which resolve from the
 * `@theme` block in `app/globals.css`. That block is the source of truth.
 *
 * A handful of places cannot use a class: SVG chart strokes built in JS, the
 * Leaflet marker gradients, and a popup's inline style string. They read these
 * constants instead of spelling the hex out again, and
 * `__tests__/brand-colour.test.ts` fails the build if these values and the
 * stylesheet's ever disagree.
 */
export const BRAND = {
  /** The brand green. */
  green: "#2c5f2e",
  /** Hover state for a solid green button. */
  greenHover: "#245026",
  /** Pale green ground for selected rows and highlight panels. */
  greenTint: "#f0f7f0",
} as const;

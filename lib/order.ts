import { sizeOptions, type SizeType } from "@/data/products";
import { GREETING_CARD_SINGLE_CAD, POSTCARD_SINGLE_CAD } from "@/data/merchandise";
import { giftShopProducts } from "@/data/giftShop";

/**
 * What the Buy Now form sends, and what the server makes of it.
 *
 * The form used to post the title, size label and price as text, and the
 * route mailed them back out — including to whatever address was typed in,
 * from the site's own domain. So anyone could send a "Your enquiry for
 * <any text they liked>" email to anyone. Now the browser sends only ids and
 * choices; the title, size and price are looked up here, and anything that
 * isn't a real, visible, available work at a real size is refused.
 */

export type OrderRequest =
  | { kind: "print"; productId: string; size: string; framed?: boolean }
  | { kind: "card"; productId: string; card: "greeting" | "postcard" }
  | { kind: "pack"; packId: string; imageIds: string[] };

export type ResolvedOrder = {
  title: string;
  sizeLabel: string;
  price: number;
  /** Pack contents, for the owner's email only. */
  details?: string;
};

type Work = { id: string; title: string; sizeType: string; visible: boolean; soldOut: boolean };

export type WorkLookup = {
  one: (id: string) => Promise<Work | null>;
  many: (ids: string[]) => Promise<Work[]>;
};

export const CARDS = {
  greeting: { label: "Greeting card", price: GREETING_CARD_SINGLE_CAD },
  postcard: { label: "Postcard", price: POSTCARD_SINGLE_CAD },
} as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const available = (w: Work | null): w is Work => !!w && w.visible && !w.soldOut;
const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;

export async function resolveOrder(
  input: unknown,
  works: WorkLookup
): Promise<{ ok: true; order: ResolvedOrder } | { ok: false; reason: string }> {
  const bad = (reason: string) => ({ ok: false as const, reason });
  if (!input || typeof input !== "object") return bad("Missing order");
  const o = input as Record<string, unknown>;

  if (o.kind === "print") {
    if (!isString(o.productId) || !isString(o.size)) return bad("Missing order");
    const work = await works.one(o.productId);
    if (!available(work)) return bad("That work isn't available to order");
    const size = sizeOptions[work.sizeType as SizeType]?.find((s) => s.label === o.size);
    if (!size) return bad("That size isn't offered for this work");
    const framed = o.framed === true;
    return {
      ok: true,
      order: {
        title: framed ? `${work.title} (+ frame quote)` : work.title,
        sizeLabel: framed ? `${size.label} (frame quote requested)` : size.label,
        price: size.salePrice,
      },
    };
  }

  if (o.kind === "card") {
    if (!isString(o.productId) || (o.card !== "greeting" && o.card !== "postcard")) {
      return bad("Missing order");
    }
    const work = await works.one(o.productId);
    if (!available(work)) return bad("That work isn't available to order");
    const card = CARDS[o.card];
    return { ok: true, order: { title: work.title, sizeLabel: card.label, price: card.price } };
  }

  if (o.kind === "pack") {
    const pack = giftShopProducts.find((p) => p.id === o.packId);
    if (!pack) return bad("Unknown gift-shop product");
    const ids = o.imageIds;
    if (!Array.isArray(ids) || !ids.every(isString)) return bad("Missing order");
    if (ids.length !== pack.photoCount || new Set(ids).size !== ids.length) {
      return bad(`Choose ${pack.photoCount} different images`);
    }
    const found = new Map((await works.many(ids)).filter(available).map((w) => [w.id, w]));
    if (found.size !== ids.length) return bad("One of those images isn't available");

    const calendar = pack.id === "calendar";
    const lines = ids.map((id, i) => `  ${calendar ? MONTHS[i] : `#${i + 1}`}: ${found.get(id)!.title}`);
    const heading = calendar
      ? `Calendar months (${ids.length} photos):`
      : `${pack.title} selections (${ids.length}):`;
    return {
      ok: true,
      order: {
        title: pack.title,
        sizeLabel: `${pack.photoCount}-image ${pack.shortTitle}`,
        price: pack.priceCAD,
        details: `${heading}\n${lines.join("\n")}`,
      },
    };
  }

  return bad("Missing order");
}

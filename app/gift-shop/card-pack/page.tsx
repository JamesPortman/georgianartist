import type { Metadata } from "next";
import PackBuilderClient from "../PackBuilderClient";
import { getVisibleArtwork } from "../gallery";
import { siteConfig } from "@/data/siteConfig";
import { giftShopProducts } from "@/data/giftShop";

const PACK = giftShopProducts.find((p) => p.id === "card-pack")!;

export const metadata: Metadata = {
  title: `Greeting Card 6-Pack | ${siteConfig.brand} Gift Shop`,
  // Price and shipping from the data, so a price change can't leave the
  // search snippet quoting the old one. Shipping is only free over the
  // threshold, which no single pack reaches — this once claimed otherwise.
  description: `Build a set of six 5×7 folded greeting cards from your favourite Georgian Bay images. CA$${PACK.priceCAD}; free shipping in Canada on orders over CA$${siteConfig.freeShipping.threshold}.`,
  alternates: { canonical: "/gift-shop/card-pack" },
};

export const dynamic = "force-dynamic";

export default async function CardPackBuilderPage() {
  const gallery = await getVisibleArtwork();
  return <PackBuilderClient productId="card-pack" gallery={gallery} />;
}

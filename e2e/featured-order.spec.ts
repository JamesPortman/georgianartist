import { test, expect } from "./test";
import { products } from "../data/products";
import { photographs } from "../data/photographs";

// "Featured", the default view of both galleries, is the catalogue's own order:
// sortOrder, set by drag-to-reorder in the admin and by engagement
// (scripts/rank-by-engagement.ts), with sold-out work last. It used to regroup
// by New/Sale/price, so the admin's order only broke ties — and reordering the
// catalogue by engagement changed nothing a visitor could see.
//
// The seed sets sortOrder to each work's position in data/products.ts and
// data/photographs.ts, so that is the expected order. Only works actually on
// the page are compared, since the admin specs hide and show works.

const seedOrder = (works: { id: string; soldOut?: boolean }[]) => [
  ...works.filter((w) => !w.soldOut).map((w) => w.id),
  ...works.filter((w) => w.soldOut).map((w) => w.id),
];

for (const { path, prefix, expectedAll } of [
  { path: "/", prefix: "/products/", expectedAll: seedOrder(products) },
  { path: "/photographs", prefix: "/photographs/", expectedAll: seedOrder(photographs) },
]) {
  test(`${path}: Featured shows the catalogue order, sold-out last`, async ({ page }) => {
    await page.goto(path);
    const cards = page.locator(".grid a");
    await expect(cards.first()).toBeVisible();
    const onPage = (await cards.evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? "")))
      .filter((h) => h.startsWith(prefix))
      .map((h) => h.slice(prefix.length));

    const expected = expectedAll.filter((id) => onPage.includes(id));
    expect(expected.length).toBeGreaterThan(5);
    expect(onPage.filter((id) => expected.includes(id))).toEqual(expected);
  });
}

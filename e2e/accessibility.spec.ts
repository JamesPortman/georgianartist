import { test, expect, type Page } from "./test";
import AxeBuilder from "@axe-core/playwright";
import { products } from "../data/products";
import { PHOTO_WITH_MAP } from "./fixtures";

/**
 * Automated accessibility checks with axe-core, against WCAG 2.1 A and AA.
 *
 * axe finds the mechanical failures — missing labels and alt text, colour
 * contrast, broken ARIA, duplicate ids, unreachable controls — which is
 * roughly a third of what WCAG asks. It cannot tell whether alt text is
 * accurate, whether focus order makes sense, or whether the site works with a
 * screen reader. A clean run here is a floor, not a verdict.
 *
 * Every public page type is scanned in its first-load state, plus the
 * overlays a visitor actually opens: the mobile menu and the Buy Now form.
 * The admin is left out; one person uses it.
 */

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Rules reported but not yet enforced — none, as of 28 Sep 2026. The escape
 * hatch stays for the next rule a new axe release adds: list it here and it is
 * still scanned and attached to each test as an annotation, without failing
 * the build, until it is fixed.
 *
 * Two rules sat here from when axe was wired in until they were fixed:
 *   - color-contrast: `text-gray-400` (#99a1af) on the light backgrounds,
 *     2.3–2.6:1 against the 4.5:1 needed, and white text on the amber "Sale"
 *     badge, 2.1:1. Secondary text is now `gray-500`; `gray-600` wherever it
 *     can sit on the cream newsletter band (gray-500 is 4.29 there) or the
 *     brand tint of a selected size (4.44). The badge text is dark.
 *   - link-in-text-block: links inside a sentence differed from the words
 *     around them only by colour. They are underlined now; standalone links
 *     (Back, Clear filters, See all the films →) are not, and aren't covered.
 */
const NOT_YET_ENFORCED: string[] = [];

// From the seed the test database is built from, so a deleted work can't
// silently turn a page scan into a 404 scan.
const PAINTING = products.find((p) => !p.soldOut)?.id;
if (!PAINTING) throw new Error("The seed has no painting for sale to scan.");

const PAGES: [name: string, path: string][] = [
  ["Paintings gallery", "/"],
  ["Painting detail", `/products/${PAINTING}`],
  ["Photographs gallery", "/photographs"],
  ["Photograph detail", `/photographs/${PHOTO_WITH_MAP}`],
  ["Locations map", "/locations"],
  ["Making Of", "/making-of"],
  ["Gift shop", "/gift-shop"],
  ["Gift shop pack builder", "/gift-shop/card-pack"],
  ["About", "/about"],
  ["FAQ & Contact", "/contact"],
  ["For Artists", "/for-artists"],
  ["Architecture", "/architecture"],
  ["Test inventory", "/architecture/tests"],
  ["Book a chat", "/book"],
];

/**
 * One line per rule, so a failure names what to fix rather than dumping axe's
 * full JSON: the rule, its impact, how many elements, and where the first few
 * are.
 */
async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const describe = (v: (typeof violations)[number]) =>
    `${v.id} (${v.impact}, ${v.nodes.length}×): ${v.help} → ` +
    v.nodes
      .slice(0, 3)
      .map((n) => n.target.join(" "))
      .join(" | ");

  for (const v of violations.filter((v) => NOT_YET_ENFORCED.includes(v.id))) {
    test.info().annotations.push({ type: "a11y: not yet enforced", description: describe(v) });
  }
  return violations.filter((v) => !NOT_YET_ENFORCED.includes(v.id)).map(describe);
}

for (const [name, path] of PAGES) {
  test(`a11y: ${name} (${path})`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should load`).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    expect(await scan(page)).toEqual([]);
  });
}

test("a11y: mobile menu open", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/about");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.locator('header a[href="/contact"]:visible').first()).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("a11y: Buy Now order form open", async ({ page }) => {
  await page.goto(`/products/${PAINTING}`);
  await page.getByRole("button", { name: /buy now/i }).first().click();
  await expect(page.getByRole("textbox").first()).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

import { test, expect, type Page } from "./test";

/**
 * Visual regression: what the key pages look like, compared on every pull
 * request against reference screenshots in e2e/__screenshots__/. The other
 * specs check what a page does; none notices a gallery that lost its grid or
 * a painting page whose image slid under the price, which on an art site is
 * the part that matters.
 *
 * Runs as its own Playwright project ("visual"), before the main suite, so
 * the catalogue is the freshly seeded one: the admin specs reorder and hide
 * works, and a screenshot of that would differ for reasons that aren't bugs.
 *
 * The references are rendered on GitHub's runner, never on a laptop, since
 * fonts and anti-aliasing differ between machines: after an intended change
 * in look, run the "Visual baselines" workflow on the branch
 * (.github/workflows/visual-baselines.yml), which commits new ones.
 */

const PAGES = [
  { name: "gallery", path: "/" },
  { name: "painting", path: "/products/lora-bay" },
  { name: "photographs", path: "/photographs" },
  { name: "gift-shop", path: "/gift-shop" },
  { name: "about", path: "/about" },
];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
];

/** Wait until what is on screen has finished drawing: fonts, and every visible image. */
async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () =>
      [...document.images]
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
        })
        .every((img) => img.complete && img.naturalWidth > 0),
    undefined,
    { timeout: 30_000 }
  );
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const p of PAGES) {
      test(`${p.name} looks as it did`, async ({ page }) => {
        await page.goto(p.path);
        await settled(page);
        await expect(page).toHaveScreenshot(`${p.name}-${vp.name}.png`, {
          // The sale banner names the season and the footer the year: both
          // change with the calendar, not with the code.
          mask: [page.locator("[data-seasonal]"), page.locator("footer")],
        });
      });
    }
  });
}

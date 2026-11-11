import { test, expect } from "./test";

// Test 1: Selecting a size updates the displayed price
test("size selector updates the displayed price", async ({ page }) => {
  await page.goto("/products/peasemarsh");

  // Default size (12" × 16") should show CA$119.00
  await expect(page.locator("text=CA$119.00").first()).toBeVisible();

  // Each size gives its centimetres too
  await expect(page.getByRole("button", { name: /12" × 16" \(30 × 41 cm\)/ })).toBeVisible();

  // Click the 18" × 24" size button
  await page.getByRole("button", { name: /18" × 24"/ }).click();

  // Price should update to CA$199.00
  await expect(page.locator("text=CA$199.00").first()).toBeVisible();

  // Click the 24" × 32" size button
  await page.getByRole("button", { name: /24" × 32"/ }).click();

  // Price should update to CA$299.00
  await expect(page.locator("text=CA$299.00").first()).toBeVisible();
});

// Test 2: Buy Now form shows the currently selected size and price
test("Buy Now form shows the selected size and price", async ({ page }) => {
  await page.goto("/products/peasemarsh");

  // Select the 18" × 24" size
  await page.getByRole("button", { name: /18" × 24"/ }).click();

  // Open the Buy Now form
  await page.getByRole("button", { name: "Buy Now" }).click();

  // Form summary line shows the product, selected size and price together
  await expect(page.getByText(/Peasemarsh.*24".*CA\$199\.00/)).toBeVisible();
});

// Test 3: Category filter shows only matching paintings
test("category filter shows only matching paintings", async ({ page }) => {
  await page.goto("/");

  // Count all cards before filtering
  const allCards = page.locator(".grid a");
  const totalCount = await allCards.count();

  // Select "Georgian Bay" from the filter — wait for re-render before counting
  await page.selectOption("#category-filter", "Georgian Bay");
  await expect(page.locator(".grid a")).not.toHaveCount(totalCount);
  const filteredCount = await page.locator(".grid a").count();
  expect(filteredCount).toBeGreaterThan(0);
  expect(filteredCount).toBeLessThan(totalCount);

  // Switch to "Grey Highlands" — wait for re-render then check count
  await page.selectOption("#category-filter", "Grey Highlands");
  await expect(page.locator(".grid a")).not.toHaveCount(filteredCount);
  const greyCount = await page.locator(".grid a").count();
  expect(greyCount).toBeGreaterThan(0);

  // Reset to All — full count returns
  await page.selectOption("#category-filter", "");
  await expect(page.locator(".grid a")).toHaveCount(totalCount);
});

// Test 4: Sort dropdown changes the order of paintings in the gallery
test("sort dropdown reorders the gallery", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".grid a");
  await expect(cards.first()).toBeVisible();

  // Assert the ORDERING, not specific titles or prices. Pinning this test to
  // "the CA$279 diptych is first" meant it broke the moment that painting was
  // repriced — which tells you nothing about whether sorting works.
  const prices = async () =>
    (await cards.allTextContents())
      .map((t) => t.match(/CA\$([\d,]+\.\d{2})/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => Number(m[1]!.replace(/,/g, "")));

  const titles = async () => await cards.locator("img").evaluateAll(
    (imgs) => imgs.map((i) => (i as HTMLImageElement).alt)
  );

  // Sorting is client-side, so the grid re-renders a tick after selectOption.
  // allTextContents() is a one-shot read with no auto-retry, unlike a normal
  // matcher — so poll until the DOM reflects the new order.
  async function expectSorted<T>(read: () => Promise<T[]>, cmp: (a: T, b: T) => number) {
    await expect(async () => {
      const got = await read();
      expect(got.length).toBeGreaterThan(1);
      expect(got).toEqual([...got].sort(cmp));
    }).toPass({ timeout: 10000 });
  }

  await page.selectOption("#sort-select", "price-desc");
  await expectSorted(prices, (a, b) => b - a);
  const highest = (await prices())[0]!;

  await page.selectOption("#sort-select", "price-asc");
  await expectSorted(prices, (a, b) => a - b);
  expect((await prices())[0]).toBeLessThanOrEqual(highest);

  await page.selectOption("#sort-select", "name-asc");
  await expectSorted(titles, (a, b) => a.localeCompare(b));
});

// Test 5: Related paintings section appears on product detail pages
test("related paintings section shows other paintings in the same category", async ({ page }) => {
  await page.goto("/products/blue-mountain-trail-painting");

  const heading = page.getByRole("heading", { name: "More from Blue Mountain" });
  await expect(heading).toBeVisible();

  // 5 paintings in Blue Mountain total → 4 shown as related
  // Navigate: heading → parent container → child grid div → direct <a> children
  const relatedLinks = heading.locator("xpath=../div/a");
  await expect(relatedLinks).toHaveCount(4);
});

// Test 6: Buy Now form submits and shows confirmation
test("Buy Now form submits and shows confirmation", async ({ page }) => {
  await page.route("/api/buy", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }), contentType: "application/json" })
  );

  await page.goto("/products/peasemarsh");

  await page.getByRole("button", { name: "Buy Now" }).click();
  await page.getByLabel(/name/i).fill("Test User");
  await page.getByRole("main").getByLabel(/email/i).fill("test@example.com");
  await page.getByLabel(/phone/i).fill("555-123-4567");
  await page.getByLabel(/shipping address/i).fill("123 Test St, Collingwood, ON");
  await page.getByRole("button", { name: /send enquiry/i }).click();

  await expect(page.getByText(/enquiry sent/i)).toBeVisible();
});

// Test 7: Unknown URL shows the custom 404 page with a link back to the gallery
test("unknown URL shows custom 404 page with link back to gallery", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");

  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  await page.getByRole("link", { name: "Back to gallery" }).click();
  await expect(page).toHaveURL("/");
});

// ── Lightbox ──────────────────────────────────────────────────────────────────

test("a work's image opens full-screen and closes with the button or Escape", async ({ page }) => {
  await page.goto("/products/lora-bay");
  const enlarge = page.getByRole("button", { name: /enlarge image of/i });
  const close = page.getByRole("button", { name: "Close" });

  await enlarge.click();
  await expect(close).toBeVisible();
  await close.click();
  await expect(close).toHaveCount(0);

  await enlarge.click();
  await expect(close).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(close).toHaveCount(0);
});

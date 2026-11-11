import { test, expect } from "./test";
import { photographs } from "../data/photographs";
import { PHOTO_WITH_MAP } from "./fixtures";

// Test 1: Photographs gallery renders all photos
test("photographs gallery shows all photographs", async ({ page }) => {
  await page.goto("/photographs");

  await expect(page.getByRole("heading", { name: "Photographs", level: 1 })).toBeVisible();

  // Derived from the seed the test DB is built from, so adding a photograph
  // doesn't silently break this.
  await expect(page.locator(".grid a")).toHaveCount(photographs.length);
});

// Test 2: Category filter narrows the photographs shown
test("photographs category filter shows only matching photographs", async ({ page }) => {
  await page.goto("/photographs");

  const totalCount = await page.locator(".grid a").count();

  // Filter to "Georgian Bay" — 1 photograph
  await page.selectOption("#photo-category-filter", "Georgian Bay");
  await expect(page.locator(".grid a")).not.toHaveCount(totalCount);
  const filteredCount = await page.locator(".grid a").count();
  expect(filteredCount).toBeGreaterThan(0);
  expect(filteredCount).toBeLessThan(totalCount);

  // Reset to All — full count returns
  await page.selectOption("#photo-category-filter", "");
  await expect(page.locator(".grid a")).toHaveCount(totalCount);
});

// Test 3: Sort dropdown reorders photographs
test("photographs sort dropdown reorders the gallery", async ({ page }) => {
  await page.goto("/photographs");

  // Derive the expectations from the seed so adding a photograph can't make
  // these stale (they previously hardcoded titles that a new photo displaced).
  const cheapest = [...photographs].sort((a, b) => a.price - b.price)[0];
  const firstByName = [...photographs].sort((a, b) => a.title.localeCompare(b.title))[0];

  // Price low→high (the default is Featured, the catalogue's own order —
  // e2e/featured-order.spec.ts)
  await page.selectOption("#photo-sort-select", "price-asc");
  await expect(page.locator(".grid a").first()).toContainText(cheapest!.title);

  // Name A–Z
  await page.selectOption("#photo-sort-select", "name-asc");
  await expect(page.locator(".grid a").first()).toContainText(firstByName!.title);
});

// Test 4: Clicking a photograph card opens its detail page
test("clicking a photograph card navigates to the detail page", async ({ page }) => {
  await page.goto("/photographs");

  await page.locator(".grid a").first().click();

  // Detail page has a Buy Now button and a back link
  await expect(page.getByRole("button", { name: "Buy Now" })).toBeVisible();
  await expect(page.getByRole("button", { name: /back to photographs/i })).toBeVisible();
});

// Test 5: Back button on photograph detail returns to the photographs gallery
test("back button on photograph detail returns to the gallery", async ({ page }) => {
  await page.goto("/photographs");
  await page.locator(".grid a").first().click();

  await page.getByRole("button", { name: /back to photographs/i }).click();

  await expect(page).toHaveURL(/\/photographs/);
  await expect(page.getByRole("heading", { name: "Photographs", level: 1 })).toBeVisible();
});

// Test 6: Buy Now on a photograph detail page submits and shows confirmation
test("Buy Now on photograph detail submits and shows confirmation", async ({ page }) => {
  await page.route("/api/buy", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }), contentType: "application/json" })
  );

  await page.goto(`/photographs/${PHOTO_WITH_MAP}`);

  await page.getByRole("button", { name: "Buy Now" }).click();
  await page.getByLabel(/name/i).fill("Test User");
  await page.getByRole("main").getByLabel(/email/i).fill("test@example.com");
  await page.getByLabel(/phone/i).fill("555-123-4567");
  await page.getByLabel(/shipping address/i).fill("123 Test St, Collingwood, ON");
  await page.getByRole("button", { name: /send enquiry/i }).click();

  await expect(page.getByText(/enquiry sent/i)).toBeVisible();
});

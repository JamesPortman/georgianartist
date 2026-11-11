import { test, expect } from "./test";

// ── Gallery search ────────────────────────────────────────────────────────────

test("search box narrows the gallery and clear filters restores it", async ({ page }) => {
  await page.goto("/");

  const cards = page.locator(".grid a");
  const totalCount = await cards.count();
  expect(totalCount).toBeGreaterThan(1);

  // Search for a specific painting
  await page.fill("#gallery-search", "Peasemarsh");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Peasemarsh");

  // URL syncs the query
  await expect(page).toHaveURL(/q=Peasemarsh/);

  // A query with no matches shows the empty state + working reset
  await page.fill("#gallery-search", "zzz-no-such-painting");
  await expect(page.getByText(/no paintings match your search/i)).toBeVisible();
  await page.getByRole("button", { name: /clear filters/i }).click();
  await expect(cards).toHaveCount(totalCount);
});

// ── New Arrivals / On Sale filter options ─────────────────────────────────────

test("New Arrivals and On Sale filter options narrow the gallery", async ({ page }) => {
  await page.goto("/");

  const cards = page.locator(".grid a");
  const totalCount = await cards.count();

  // ✦ New Arrivals
  await page.selectOption("#category-filter", "__new__");
  await expect(cards).not.toHaveCount(totalCount);
  const newCount = await cards.count();
  expect(newCount).toBeGreaterThan(0);
  expect(newCount).toBeLessThan(totalCount);

  // ★ On Sale
  await page.selectOption("#category-filter", "__sale__");
  const saleCount = await cards.count();
  expect(saleCount).toBeGreaterThan(0);

  // Reset
  await page.selectOption("#category-filter", "");
  await expect(cards).toHaveCount(totalCount);
});

// ── Testimonial ───────────────────────────────────────────────────────────────

test("home page shows the collector testimonial", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /what collectors say/i })).toBeVisible();
  await expect(page.getByText(/Greg Fisher/)).toBeVisible();
});

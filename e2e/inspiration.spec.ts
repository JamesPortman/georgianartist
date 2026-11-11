import { test, expect } from "./test";

// global-setup gives council-beach an inspiration photo + GPS.
test("a painting with an inspiration photo shows the switcher thumbnail + map", async ({ page }) => {
  await page.goto("/products/council-beach");

  // Inspiration thumbnail in the image switcher
  await expect(page.getByRole("button", { name: /view the inspiration photo/i })).toBeVisible();

  // Location map + Google Maps link
  await expect(page.locator('iframe[title="Inspiration location"]')).toBeVisible();
  await expect(page.getByRole("link", { name: /open in google maps/i })).toBeVisible();
});

test("a painting without an inspiration photo shows no inspiration thumbnail", async ({ page }) => {
  await page.goto("/products/peasemarsh");
  await expect(
    page.getByRole("button", { name: /view the inspiration photo/i })
  ).toHaveCount(0);
});

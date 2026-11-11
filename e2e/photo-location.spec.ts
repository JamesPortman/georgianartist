import { test, expect } from "./test";
import { PHOTO_PANORAMIC, PHOTO_WITHOUT_GPS, PHOTO_WITH_MAP } from "./fixtures";

// global-setup gives PHOTO_WITH_MAP and PHOTO_PANORAMIC GPS coordinates, and
// deliberately leaves ravenna-canola-photo without them.

test("a photograph with GPS shows the location map", async ({ page }) => {
  await page.goto(`/photographs/${PHOTO_WITH_MAP}`);

  await expect(page.getByText(/where the photo was taken/i)).toBeVisible();
  await expect(page.locator('iframe[title="Photo location"]')).toBeVisible();

  // Coordinates are printed and the Google Maps link points at them
  await expect(page.getByText("44.55429, -80.46047")).toBeVisible();
  await expect(page.getByRole("link", { name: /open in google maps/i })).toHaveAttribute(
    "href",
    /44\.55429,-80\.460466/
  );
});

test("a panoramic photograph also shows the location map", async ({ page }) => {
  await page.goto(`/photographs/${PHOTO_PANORAMIC}`);

  await expect(page.getByText(/where the photo was taken/i)).toBeVisible();
  await expect(page.locator('iframe[title="Photo location"]')).toBeVisible();
});

test("a photograph without GPS shows no location map", async ({ page }) => {
  await page.goto(`/photographs/${PHOTO_WITHOUT_GPS}`);

  // The page itself renders fine
  await expect(page.getByRole("button", { name: "Buy Now" })).toBeVisible();
  await expect(page.getByText(/where the photo was taken/i)).toHaveCount(0);
  await expect(page.locator('iframe[title="Photo location"]')).toHaveCount(0);
});

import { test, expect } from "./test";

/**
 * The site with a keyboard alone, and what a screen reader is told. axe
 * (accessibility.spec.ts) checks the markup of a page at rest; these check
 * what happens when someone uses it: where focus goes, and whether it comes
 * back. Each guards something a keyboard audit found missing in October 2026.
 */

test("the first Tab reaches a skip link, which jumps past the menu to the page", async ({ page }) => {
  await page.goto("/");
  // After hydration: a Tab pressed before it lands before React has wired the page up.
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
  // The next Tab lands in the page (the gallery's search), not back in the header.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("searchbox", { name: "Search paintings" })).toBeFocused();
});

test("the phone menu says whether it is open, and Escape closes it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const button = page.getByRole("button", { name: "Menu", exact: true });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await expect(page.locator('#mobile-menu a[aria-current="page"]')).toHaveText("Paintings");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#mobile-menu")).toHaveCount(0);
  await expect(button).toBeFocused();
});

test("the image viewer is a dialog that keeps focus and gives it back", async ({ page }) => {
  await page.goto("/products/lora-bay");
  const enlarge = page.getByRole("button", { name: "Enlarge image of Lora Bay" });
  await enlarge.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", { name: "Lora Bay, enlarged" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  // Tab can't wander onto the page behind it.
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(enlarge).toBeFocused();
});

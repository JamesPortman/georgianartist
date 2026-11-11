import { test, expect, type Page } from "./test";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "localdev";

// The first-party tracker (components/AnalyticsTracker.tsx → /api/track) and
// the dashboard's "Don't count this browser". Each test gets a fresh browser
// context, so a fresh anonymous visitor cookie, and excluding it can't hide
// any other test's traffic.

const trackCall = (page: Page) =>
  page.waitForRequest((r) => r.url().endsWith("/api/track") && r.method() === "POST");

test("a public page view is recorded, by path only", async ({ page }) => {
  const sent = trackCall(page);
  await page.goto("/about?utm_source=test");
  const body = (await sent).postDataJSON();
  // The path, never the query string: a query can carry what a visitor typed.
  expect(body.path).toBe("/about");
});

test("the admin is never tracked", async ({ page }) => {
  let tracked = false;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/track")) tracked = true;
  });
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  expect(tracked).toBe(false);
});

test("the dashboard can stop counting this browser, and count it again", async ({ page, context, baseURL }) => {
  // The visitor cookie /api/track would set on the live site. Locally it drops
  // every event before setting one (so test runs never become visitors), so
  // give this browser one directly.
  await context.addCookies([
    { name: "gba_vid", value: `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`, url: baseURL! },
  ]);

  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/products/);

  await page.goto("/admin/analytics");
  await page.getByPlaceholder(/label/i).fill("E2E browser");
  await page.getByRole("button", { name: "Don't count this browser" }).click();
  await expect(page.getByText("This browser is already excluded.")).toBeVisible();
  const row = page.locator("li", { hasText: "E2E browser" });
  await expect(row.getByText("this browser")).toBeVisible();

  // Undo, so the list is as it was.
  await row.getByRole("button", { name: "Count again" }).click();
  await expect(page.getByRole("button", { name: "Don't count this browser" })).toBeVisible();
  await expect(page.locator("li", { hasText: "E2E browser" })).toHaveCount(0);
});

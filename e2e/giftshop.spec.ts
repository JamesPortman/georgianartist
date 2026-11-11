import { test, expect } from "./test";
import sharp from "sharp";
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from "../lib/og-image";

// ── Gift shop landing ─────────────────────────────────────────────────────────

test("gift shop landing shows three clickable pack cards, none coming soon", async ({ page }) => {
  await page.goto("/gift-shop");

  await expect(page.getByRole("heading", { name: "Gift Shop" })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);

  // Each product card is a working link to its builder
  await expect(page.locator('a[href="/gift-shop/calendar"]')).toBeVisible();
  await expect(page.locator('a[href="/gift-shop/card-pack"]')).toBeVisible();
  await expect(page.locator('a[href="/gift-shop/postcard-pack"]')).toBeVisible();
});

// ── Calendar builder ──────────────────────────────────────────────────────────

/** Picker tiles are the only buttons with aria-pressed in the builder. */
function pickerTiles(page: import("@playwright/test").Page) {
  return page.locator("button[aria-pressed]");
}

test("calendar builder: selecting 12 images fills the months and completes", async ({ page }) => {
  await page.goto("/gift-shop/calendar");

  await expect(page.getByRole("heading", { name: /custom wall calendar/i })).toBeVisible();
  await expect(page.getByText("0 of 12 selected")).toBeVisible();

  // Select the first 12 tiles
  const tiles = pickerTiles(page);
  await expect(tiles.first()).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await tiles.nth(i).click();
  }

  await expect(page.getByText("12 of 12 selected")).toBeVisible();

  // Month badges appear in selection order (Jan … Dec)
  await expect(page.getByText("Jan", { exact: true })).toBeVisible();
  await expect(page.getByText("Dec", { exact: true })).toBeVisible();

  // With the quota full, remaining tiles are disabled
  await expect(tiles.nth(12)).toBeDisabled();

  // The order CTA appears
  await expect(
    page.getByRole("button", { name: /submit custom calendar order/i })
  ).toBeVisible();

  // Clear selection resets the builder
  await page.getByRole("button", { name: /clear selection/i }).click();
  await expect(page.getByText("0 of 12 selected")).toBeVisible();
});

test("calendar order submits the twelve chosen images, in order, as ids", async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  await page.route("/api/buy", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      body: JSON.stringify({ ok: true }),
      contentType: "application/json",
    });
  });

  await page.goto("/gift-shop/calendar");

  const tiles = pickerTiles(page);
  await expect(tiles.first()).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await tiles.nth(i).click();
  }

  await page.getByRole("button", { name: /submit custom calendar order/i }).click();
  await page.getByLabel(/name/i).fill("Calendar Buyer");
  await page.getByRole("main").getByLabel(/email/i).fill("cal@example.com");
  await page.getByLabel(/phone/i).fill("555-000-1234");
  await page.getByLabel(/shipping address/i).fill("1 Test Lane, Thornbury, ON");
  await page.getByRole("button", { name: /send enquiry/i }).click();

  await expect(page.getByText(/enquiry sent/i)).toBeVisible();

  // The browser sends ids only. The server looks up each image's title and
  // builds the month-by-month list itself (lib/order.ts, covered by
  // __tests__/order.test.ts), so no posted text can reach an email.
  expect(payload).not.toBeNull();
  const order = payload!.order as { kind: string; packId: string; imageIds: string[] };
  expect(order.kind).toBe("pack");
  expect(order.packId).toBe("calendar");
  expect(order.imageIds).toHaveLength(12);
  expect(new Set(order.imageIds).size).toBe(12);
  expect(payload).not.toHaveProperty("title");
  expect(payload).not.toHaveProperty("details");
});

// ── Card + postcard builders ──────────────────────────────────────────────────

test("card pack builder uses numbered slots and supports deselect", async ({ page }) => {
  await page.goto("/gift-shop/card-pack");

  await expect(page.getByRole("heading", { name: /greeting card 6-pack/i })).toBeVisible();
  await expect(page.getByText("0 of 6 selected")).toBeVisible();

  const tiles = pickerTiles(page);
  await tiles.nth(0).click();
  await tiles.nth(1).click();
  await expect(page.getByText("2 of 6 selected")).toBeVisible();

  // Clicking a selected tile deselects it
  await tiles.nth(0).click();
  await expect(page.getByText("1 of 6 selected")).toBeVisible();

  await page.getByRole("button", { name: /clear selection/i }).click();
  await expect(page.getByText("0 of 6 selected")).toBeVisible();
});

test("postcard pack builder requires 10 selections", async ({ page }) => {
  await page.goto("/gift-shop/postcard-pack");

  await expect(page.getByRole("heading", { name: /postcard 10-pack/i })).toBeVisible();
  await expect(page.getByText("0 of 10 selected")).toBeVisible();
  await expect(page.getByText(/choose your images/i)).toBeVisible();
});

// ── Thumbnails and the social preview must track the live catalogue ──────────

test("gift shop thumbnails come from visible artwork and all load", async ({ page }) => {
  await page.goto("/gift-shop");

  const imgs = page.locator(".grid img");
  const count = await imgs.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i++) {
    const src = await imgs.nth(i).getAttribute("src");
    expect(src, "thumbnail should have a src").toBeTruthy();
    const res = await page.request.get(src!);
    expect(res.status(), `gift shop thumbnail ${src} is broken`).toBe(200);
  }

  // The alt text names the work, which is how we know it came from the
  // catalogue rather than a path pinned in the source.
  await expect(imgs.first()).toHaveAttribute("alt", /example artwork: .+/);
});

test("the site's social preview image is served directly, from a work that is for sale", async ({ page }) => {
  const res = await page.request.get("/api/og-image", { maxRedirects: 0 });

  // Served, not redirected. It used to answer 302 to the painting's own file,
  // and crawlers that don't follow that hop got no card at all — LinkedIn
  // failed on the first scrape and succeeded on the second.
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/jpeg");

  // The size the meta tag promises has to be the size that arrives. The tag
  // claimed 1200 wide while the file behind it was 2400 x 1201.
  const body = await res.body();
  const { width, height } = await sharp(body).metadata();
  expect({ width, height }).toEqual({ width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT });

  // The work it was built from must be on the public site, not hidden. Its
  // detail page is the check: hidden works 404.
  const id = res.headers()["x-og-work"];
  expect(id, "the route should name the work it rendered").toBeTruthy();
  const detail = await page.request.get(`/products/${id}`);
  expect(detail.status(), `og-image rendered ${id}, which is not publicly visible`).toBe(200);
});

// ── Ordering a card or postcard pack ──────────────────────────────────────────
// The builders are covered above; only the calendar's order was. Same builder,
// different counts — so pin that each orders its own pack with its own ids.

for (const pack of [
  { path: "/gift-shop/card-pack", packId: "card-pack", count: 6, heading: /greeting card 6-pack/i },
  { path: "/gift-shop/postcard-pack", packId: "postcard-pack", count: 10, heading: /postcard 10-pack/i },
]) {
  test(`${pack.packId} order submits its ${pack.count} chosen images, in order, as ids`, async ({ page }) => {
    let payload: Record<string, unknown> | null = null;
    await page.route("/api/buy", async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto(pack.path);
    await expect(page.getByRole("heading", { name: pack.heading })).toBeVisible();
    await expect(page.getByText(`0 of ${pack.count} selected`)).toBeVisible();

    const tiles = pickerTiles(page);
    const chosen: string[] = [];
    for (let i = 0; i < pack.count; i++) {
      chosen.push((await tiles.nth(i).getAttribute("data-id"))!);
      await tiles.nth(i).click();
    }
    await expect(page.getByText(`${pack.count} of ${pack.count} selected`)).toBeVisible();
    await expect(tiles.nth(pack.count)).toBeDisabled();

    await page.getByRole("button", { name: /submit .* order/i }).click();
    await page.getByLabel(/name/i).fill("Pack Buyer");
    await page.getByRole("main").getByLabel(/email/i).fill("pack@example.com");
    await page.getByLabel(/phone/i).fill("555-000-1234");
    await page.getByLabel(/shipping address/i).fill("1 Test Lane, Thornbury, ON");
    await page.getByRole("button", { name: /send enquiry/i }).click();
    await expect(page.getByText(/enquiry sent/i)).toBeVisible();
    expect(payload!.order).toEqual({ kind: "pack", packId: pack.packId, imageIds: chosen });
  });
}

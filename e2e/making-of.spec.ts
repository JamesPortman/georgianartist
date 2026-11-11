import { test, expect } from "./test";
import { PHOTO_WITH_MAP } from "./fixtures";
import { makingOfFilms } from "../data/making-of";
import { products } from "../data/products";
import { photographs } from "../data/photographs";

/** The page only renders a link when the film's product exists and is visible. */
const seededProductIds = new Set([
  ...products.map((p) => p.id),
  ...photographs.map((p) => p.id),
]);

// The films are seeded by prisma/seed.ts from data/making-of.ts, so CI and the
// live catalog carry the same set.
//
// Nothing here downloads a film. The player is a facade: until someone clicks
// it there is no <video> on the page at all, and that — not `preload="none"`,
// which Safari treats as a suggestion — is what keeps 22 films off the wire on
// /making-of. The one test that does click intercepts the request so the
// assertion is "it asked for the file", never 10-30MB across CI's network.

/** The play button that stands in for each film. */
const players = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: /Play the film of/ });

test("the making-of page lists every published film", async ({ page }) => {
  await page.goto("/making-of");

  await expect(page.getByRole("heading", { name: "Making Of", level: 1 })).toBeVisible();

  await expect(players(page).first()).toBeVisible();
  expect(await players(page).count()).toBeGreaterThanOrEqual(3);

  await expect(page.getByRole("heading", { name: "Manitoulin Island", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Peasemarsh", level: 2 })).toBeVisible();
});

test("no film and no full-size still is fetched before anyone presses play", async ({ page }) => {
  const media: string[] = [];
  const rawBlobImages: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    if (/\.mp4(\?|$)/.test(url)) media.push(url);
    // A still served straight off Blob is the other half of the old bug: it is
    // fetched whatever `preload` says, at full size, once per film. Tested on
    // the host, not the string — the optimiser URL carries the Blob URL in its
    // query, and encodeURIComponent leaves the dots alone, so a substring
    // check here matches the very requests it is meant to bless.
    if (r.resourceType() === "image" && new URL(url).hostname.endsWith("blob.vercel-storage.com")) {
      rawBlobImages.push(url);
    }
  });

  await page.goto("/making-of");
  await expect(players(page).first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(media).toEqual([]);
  expect(rawBlobImages).toEqual([]);
  expect(await page.locator("video").count()).toBe(0);
});

test("the stills go through the image optimiser", async ({ page }) => {
  await page.goto("/making-of");
  const poster = players(page).first().locator("img");
  await expect(poster).toBeVisible();

  // next/image rewrites the Blob URL to /_next/image?url=…; that rewrite is
  // what turned 16.3MB of stills per page view into a couple of hundred KB.
  await expect(poster).toHaveAttribute("src", /^\/_next\/image\?url=/);
  await expect(poster).toHaveAttribute("src", /blob\.vercel-storage\.com/);
});

test("clicking play mounts the player and asks for the film", async ({ page }) => {
  const asked: string[] = [];
  // Intercept before clicking: we want the request, not the bytes.
  await page.route(/\.mp4(\?|$)/, (route) => {
    asked.push(route.request().url());
    return route.abort();
  });

  await page.goto("/making-of");
  await players(page).first().click();

  const video = page.locator("video").first();
  await expect(video).toBeVisible();
  await expect(video.locator("source")).toHaveAttribute("type", "video/mp4");
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  expect(asked[0]).toMatch(/\/making-of\/faststart\//);
});

test("every film links through to its finished print", async ({ page }) => {
  await page.goto("/making-of");

  // Peasemarsh was published before its painting existed; now that the painting
  // is in the catalogue the film links itself up, which is what the nullable
  // productId is for.
  //
  // Counted from the seed rather than hardcoded. This said 3, matching a seed
  // that had drifted to three films (all of them pointing at deleted blobs)
  // while production had twenty-two. A literal here asserts how many films
  // happened to be seeded on the day it was written, not the thing the test is
  // named for — that EVERY film reaches its print.
  const expected = makingOfFilms.filter(
    (f) => f.productId !== null && seededProductIds.has(f.productId)
  ).length;

  const links = page.getByRole("link", { name: /See the finished print/ });
  expect(await links.count()).toBe(expected);
  await expect(links.first()).toHaveAttribute("href", /\/products\//);

  const peasemarsh = page.locator("article", { hasText: "Peasemarsh" });
  await expect(peasemarsh.getByRole("link", { name: /See the finished print/ })).toHaveAttribute(
    "href",
    "/products/peasemarsh"
  );
});

test("a work's own page shows its film", async ({ page }) => {
  for (const id of ["manitoulin-island", "local-farm-painting", "peasemarsh"]) {
    await page.goto(`/products/${id}`);
    await expect(page.getByRole("heading", { name: "How it was made" })).toBeVisible();
    await expect(players(page)).toHaveCount(1);
    await expect(page.locator("video")).toHaveCount(0);
  }
});

test("the photograph a painting came from is shown on the painting, not vice versa", async ({ page }) => {
  // Each film documents a painting, so it lives on the painting's page. The
  // photograph it was painted from is surfaced there too, as the inspiration
  // image — the photograph's own page stays a photograph listing.
  await page.goto("/products/local-farm-painting");
  await expect(page.getByRole("button", { name: /Inspiration/i })).toBeVisible();

  await page.goto("/photographs/local-farm");
  await expect(players(page)).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
});

test("a work without a film shows no player", async ({ page }) => {
  await page.goto(`/photographs/${PHOTO_WITH_MAP}`);
  await expect(players(page)).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
});

test("Making Of is reachable from the navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.locator('header nav a[href="/making-of"]').click();
  await expect(page).toHaveURL(/\/making-of/);
});

test("a film links to the spot on the map where its painting was made", async ({ page }) => {
  // global-setup gives council-beach coordinates; its film is in the seed.
  await page.goto("/making-of");
  const article = page.locator("article", { hasText: "Council Beach" });
  const link = article.getByRole("link", { name: /See the spot on the map/ });
  await expect(link).toHaveAttribute("href", "/locations?work=council-beach");
  await link.click();
  await expect(page).toHaveURL(/\/locations\?work=council-beach$/);
  await expect(page.locator(".leaflet-popup")).toContainText("Council Beach", { timeout: 15000 });
});

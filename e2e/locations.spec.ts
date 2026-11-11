import { test, expect } from "./test";

// global-setup gives council-beach (painting) and two photographs coordinates,
// so the map always has something to plot in CI.

test("locations page plots the works that have coordinates", async ({ page }) => {
  await page.goto("/locations");

  await expect(page.getByRole("heading", { name: "Locations" })).toBeVisible();

  // Leaflet mounts client-side; markers appear once tiles/JS are ready
  const markers = page.locator(".leaflet-marker-icon");
  await expect(markers.first()).toBeVisible({ timeout: 15000 });
  const pins = await markers.count();
  expect(pins).toBeGreaterThan(0);

  // One pin per PLACE, not per work: a painting inherits its source
  // photograph's coordinates exactly, and the two share a pin rather than
  // stacking one on top of the other.
  const works =
    Number((await page.getByText(/^Paintings \(\d+\)$/).innerText()).match(/\d+/)![0]) +
    Number((await page.getByText(/^Photographs \(\d+\)$/).innerText()).match(/\d+/)![0]);
  expect(works).toBeGreaterThanOrEqual(pins);

  // The list under the map is the map's index, so it must agree with it
  await expect(page.getByRole("heading", { name: `${pins} places` })).toBeVisible();
  await expect(page.locator("ul li button")).toHaveCount(pins);
});

test("works sharing a location share one pin, labelled with how many", async ({ page }) => {
  await page.goto("/locations");
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible({ timeout: 15000 });

  // Only assert the mechanism when the catalog actually has a shared spot —
  // production does; a seeded database only does once a painting carries its
  // source photograph's coordinates.
  const shared = page.getByText(/Both, at \d+ place/);
  if ((await shared.count()) === 0) return;
  const sharedCount = Number((await shared.innerText()).match(/\d+/)![0]);

  // The list row for a shared place offers a link per work made there. Read the
  // DOM rather than composing locator.filter({has}) — the link labels here are
  // the bare words "painting"/"photograph" and getByRole name matching proved
  // too loose to count them reliably.
  const rowTypes = await page.locator("ul li").evaluateAll((lis) =>
    lis.map((li) => [...li.querySelectorAll("a:not([data-film])")].map((a) => (a.textContent ?? "").trim()))
  );
  const mixed = rowTypes.filter((t) => t.includes("painting") && t.includes("photograph"));
  expect(mixed.length).toBe(sharedCount);
  expect(mixed[0]!.length).toBe(2);

  // Every grouped place carries a count badge on its pin — INCLUDING same-type
  // ones. Two paintings can share a spot, and such a pin is still grouped; it
  // just isn't "Both", which is what the swatch beside that legend promises.
  // So badges track grouped places, and the legend tracks mixed ones.
  const grouped = rowTypes.filter((t) => t.length > 1);
  expect(grouped.length).toBeGreaterThanOrEqual(mixed.length);

  const badged = page.locator(".leaflet-marker-icon").filter({ hasText: /^[2-9]$/ });
  expect(await badged.count()).toBe(grouped.length);
});

test("the location list focuses the map and links to the work", async ({ page }) => {
  await page.goto("/locations");
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible({ timeout: 15000 });

  // Every listed place links through to each work made there
  const work = page.getByRole("link", { name: /^(painting|photograph)$/ }).first();
  await expect(work).toHaveAttribute("href", /\/(products|photographs)\//);

  // Clicking a title focuses that pin and opens its popup
  const firstTitle = page.locator("ul li button").first();
  await firstTitle.click();
  await expect(page.locator(".leaflet-popup")).toBeVisible({ timeout: 10000 });
});

test("Locations is reachable from the navigation", async ({ page }) => {
  await page.goto("/");
  await page.locator('header nav a[href="/locations"]').click();
  await expect(page).toHaveURL(/\/locations/);
});

// global-setup gives council-beach coordinates, and the seed gives it a film.
test("a place with a film links to that film on Making Of", async ({ page }) => {
  await page.goto("/locations");
  const film = page.locator('ul li a[data-film][href$="film-council-beach"]');
  await expect(film).toHaveText("film");
  await film.click();
  await expect(page).toHaveURL(/\/making-of#film-/);
  const anchor = new URL(page.url()).hash.slice(1);
  await expect(page.locator(`article#${anchor}`)).toBeInViewport();
});

test("?work= opens that work's pin, and its popup links to the film", async ({ page }) => {
  await page.goto("/locations?work=council-beach");
  const popup = page.locator(".leaflet-popup");
  await expect(popup).toBeVisible({ timeout: 15000 });
  await expect(popup.getByRole("link", { name: "Council Beach" })).toBeVisible();
  await expect(popup.locator("a[data-film]")).toHaveAttribute("href", /^\/making-of#film-/);
  // The list marks the same place as the active one. (The painting's row is
  // the one with the film; its photograph can sit at a different spot.)
  const row = page.locator("ul li", { has: page.locator('a[data-film][href$="film-council-beach"]') });
  await expect(row.locator("button")).toHaveClass(/text-brand/);
});

test("an unknown ?work= just shows the whole map", async ({ page }) => {
  await page.goto("/locations?work=no-such-work");
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".leaflet-popup")).toHaveCount(0);
});

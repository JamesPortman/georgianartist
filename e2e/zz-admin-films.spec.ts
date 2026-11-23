import { test, expect, type Page } from "./test";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "localdev";

// Hides one film and shows it again. Serial, and sorted after the read-only
// specs (zz-), like the other admin specs that change what the site shows.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

// A film whose work is in the catalogue, and not one e2e/making-of.spec.ts
// names, so a concurrent run of that spec is disturbed as little as possible.
const FILM = { id: "alpine-ski-fall", product: "/products/alpine-ski-fall" };

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/products/);
  await expect(page.getByRole("heading", { name: /^paintings/i })).toBeVisible();
}

/** The film's Visible checkbox on /admin/films, found by the film's id. */
function toggle(page: Page) {
  return page.locator(`[data-testid="film-row"][data-film="${FILM.id}"] input[type="checkbox"]`);
}

async function setVisible(page: Page, visible: boolean) {
  await page.goto("/admin/films", { waitUntil: "domcontentloaded" });
  const box = toggle(page);
  await expect(box).toBeVisible({ timeout: 30_000 });
  if ((await box.isChecked()) !== visible) await box.click();
  // The server action has finished once a fresh load shows the new state.
  await expect(async () => {
    await page.goto("/admin/films", { waitUntil: "domcontentloaded" });
    await expect(toggle(page)).toBeChecked({ checked: visible, timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
}

test("the admin's Films page needs a session", async ({ page }) => {
  await page.goto("/admin/films");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("hiding a film in the admin takes it off /making-of and its work's page; showing it puts it back", async ({ page }) => {
  await login(page);
  await page.goto("/admin/films", { waitUntil: "domcontentloaded" });
  await expect(page.locator('header nav a[href="/admin/products"]')).toBeVisible();

  try {
    await setVisible(page, false);

    await expect(async () => {
      await page.goto("/making-of");
      await expect(page.locator(`#film-${FILM.id}`)).toHaveCount(0, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await page.goto(FILM.product);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it was made" })).toHaveCount(0);
    // Other films are still showing, so the menu keeps its link.
    await expect(page.locator('header nav a[href="/making-of"]').first()).toBeVisible();
  } finally {
    await setVisible(page, true);
  }

  await expect(async () => {
    await page.goto("/making-of");
    await expect(page.locator(`#film-${FILM.id}`)).toHaveCount(1, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await page.goto(FILM.product);
  await expect(page.getByRole("heading", { name: "How it was made" })).toBeVisible();
});

import { test, expect, type Page, type BrowserContext } from "./test";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "localdev";

// These tests mutate catalog state (visibility, price, order) and restore it
// before finishing. They run serially, and the zz- filename sorts them after
// the read-only specs to minimize overlap with count-based assertions.
test.describe.configure({ mode: "serial" });
// Round-trips poll the public site for up to 30s per direction, and a starved
// CI runner can take tens of seconds just to navigate — give each test room for
// both. Runs here take ~4s; this budget only matters when the runner is loaded.
test.setTimeout(180_000);

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/products/);
  // The URL flips as soon as the redirect commits, while the RSC payload is
  // still streaming. Wait for real content so the caller's first navigation
  // isn't racing that stream.
  await expect(page.getByRole("heading", { name: /^paintings/i })).toBeVisible();
}

/**
 * page.goto that survives the post-server-action navigation race.
 *
 * Every navigation in this spec follows either a server action or the login
 * redirect, and Next is still streaming that transition's RSC payload when we
 * ask for the next page. Navigating into an in-flight stream either detaches
 * the frame (ERR_ABORTED) or, on a loaded CI runner, wedges the navigation
 * until it times out. Both are the same race and both are worth retrying; a
 * 500 or a bad URL still fails immediately.
 *
 * Note this is deliberately NOT an expect.toPass wrapper: toPass's deadline
 * cancels the in-flight goto, so a slow-but-healthy navigation never gets to
 * finish, and a 30s first render turns into an endless abort loop.
 *
 * 60s per attempt, not 30s. A navigation here normally takes well under a
 * second; the timeout exists for a starved runner, and CI has been seen taking
 * twice its usual wall-clock, at which point 30s was failing a healthy page.
 */
async function gotoStable(page: Page, url: string, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      return;
    } catch (e) {
      const raced = /ERR_ABORTED|frame was detached|Timeout .* exceeded/i.test(String(e));
      if (i === attempts || !raced) throw e;
    }
  }
}

/**
 * Go to the admin list only if we aren't already looking at it.
 *
 * login() lands here, and re-navigating to the page you are already on is what
 * races Next's still-streaming redirect. Skipping the redundant navigation
 * removes the race rather than retrying it.
 */
async function ensureAdminList(page: Page) {
  if (new URL(page.url()).pathname === "/admin/products") return;
  await gotoStable(page, "/admin/products");
}

/**
 * How long a row may take to appear.
 *
 * Every other wait in this file is sized for a starved CI runner; these three
 * were left on Playwright's 5s default, and that is the one that expired. The
 * admin page had just processed a toggle and its router.refresh() had not yet
 * put the row back — on a loaded runner that gap comfortably exceeds 5s.
 */
const ROW_TIMEOUT = 30_000;

/**
 * The row for one product, found by id.
 *
 * NOT by title. The Lora Bay painting and the Lora Bay photograph share one,
 * and the admin renders two tables, so `hasText` matches a row in each, and
 * the toggle below would then match a switch in each — the painting's once
 * both tables are in, the photograph's if only the Photographs table has
 * arrived, none at all mid-refresh. The gift-shop assertion in this file
 * already selects by id for exactly this reason.
 *
 * The edit link is the only per-row element carrying the id, and the href is an
 * exact match — "lora-bay" cannot match "lora-bay-photo".
 */
function row(page: Page, id: string) {
  return page.locator("tr", { has: page.locator(`a[href="/admin/products/${id}"]`) });
}

/**
 * A row's Visible switch, by name rather than by column position.
 *
 * This was `.nth(2)` over the row's toggles, which silently became the wrong
 * switch the moment a Sold column was added between New and Visible — the
 * test then drove Sold and reported that hiding a painting no longer hid it.
 * `data-field` cannot drift that way.
 */
function visibleToggle(page: Page, id: string) {
  return row(page, id).locator('button[data-field="visible"]');
}

/** Whether a product's Visible toggle currently reads as on. */
async function readVisibility(page: Page, id: string): Promise<boolean> {
  await ensureAdminList(page);
  const toggle = visibleToggle(page, id);
  await expect(toggle).toBeVisible({ timeout: ROW_TIMEOUT });
  return !!(await toggle.getAttribute("title"))?.includes("disable");
}

/**
 * Read the toggle from a THROWAWAY page.
 *
 * After a toggle, the admin page is still settling its own router.refresh().
 * Reading its DOM races that refresh, and navigating it races it harder — both
 * have failed in CI, as an ERR_ABORTED, as a hung goto, and as a "saving…"
 * indicator that never cleared. A fresh page has no transition of its own, so
 * it just reports what the server currently says. It shares the context's
 * cookies, so it is already logged in.
 */
async function readVisibilityFresh(
  context: BrowserContext,
  id: string
): Promise<boolean> {
  const probe = await context.newPage();
  try {
    await gotoStable(probe, "/admin/products");
    const toggle = visibleToggle(probe, id);
    await expect(toggle).toBeVisible({ timeout: ROW_TIMEOUT });
    return !!(await toggle.getAttribute("title"))?.includes("disable");
  } finally {
    await probe.close();
  }
}

/**
 * Drive a product's Visible toggle to a desired state (rather than blind-
 * clicking), so an aborted attempt or CI retry that left the product hidden
 * can't invert the test.
 *
 * The admin page only ever CLICKS. It never navigates and its transient UI is
 * never asserted on; persistence is confirmed from a separate page instead.
 */
async function setVisibility(
  context: BrowserContext,
  page: Page,
  id: string,
  visible: boolean
) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await ensureAdminList(page);
    const toggle = visibleToggle(page, id);
    await expect(toggle).toBeVisible({ timeout: ROW_TIMEOUT });

    const current = !!(await toggle.getAttribute("title"))?.includes("disable");
    if (current === visible) return;

    // The server action's response is the only signal we trust from this page.
    const saved = page
      .waitForResponse((r) => r.request().method() === "POST", { timeout: 20000 })
      .catch(() => null);
    await toggle.click();
    await saved;

    if ((await readVisibilityFresh(context, id)) === visible) return;
    // Didn't stick — a click has been seen to be lost on a slow runner. Retry.
  }
  throw new Error(`Could not set "${id}" visible=${visible} after 3 attempts`);
}

// ── Visibility round-trip: admin toggle ⇄ public site + gift-shop pool ────────

test("toggling a painting invisible removes it from the public site and gift-shop pool", async ({ page, context }) => {
  await login(page);

  // The admin page NEVER navigates after this point, and every public-site
  // check happens on its own page.
  //
  // The toggle's router.refresh() issues its own frame navigations, and they
  // land unpredictably — sometimes after the explicit page.goto that follows
  // has already started. On one page those two race: the goto is either
  // aborted (ERR_ABORTED) or wedged until it times out, which is what has made
  // this test flaky for weeks. Separate pages have separate navigation
  // lifecycles, so a refresh here cannot touch a navigation there.
  const publicCheck = async (fn: (p: Page) => Promise<void>) => {
    const pub = await context.newPage();
    try {
      await expect(async () => {
        await pub.goto("/", { waitUntil: "domcontentloaded" });
        await fn(pub);
      }).toPass({ timeout: 30000 });
    } finally {
      await pub.close();
    }
  };

  // Restore whatever the catalog had, not a hardcoded "visible". In CI the seed
  // makes everything visible, but run against a real catalog — where Lora Bay
  // may be deliberately hidden — a hardcoded restore would publish a painting
  // the owner had taken down.
  const original = await readVisibility(page, "lora-bay");

  try {
    await setVisibility(context, page, "lora-bay", false);
    await publicCheck(async (pub) => {
      await expect(pub.locator('a[href="/products/lora-bay"]')).toHaveCount(0);
    });

    // …and out of the gift-shop builder pool, which draws on visible artwork only
    const shop = await context.newPage();
    await shop.goto("/gift-shop/calendar", { waitUntil: "domcontentloaded" });
    // Select by id, not title: the Lora Bay painting and the Lora Bay
    // photograph share a title, so a title selector matches both and can
    // never reach zero while the photograph is legitimately still visible.
    await expect(shop.locator('button[data-id="lora-bay"]')).toHaveCount(0);
    await shop.close();

    await setVisibility(context, page, "lora-bay", true);
    await publicCheck(async (pub) => {
      await expect(pub.locator('a[href="/products/lora-bay"]')).toHaveCount(1);
    });
  } finally {
    await setVisibility(context, page, "lora-bay", original);
  }
});

// ── Edit form round-trip: price change reaches the public card ────────────────

test("editing a painting's price in the admin updates the public card", async ({ page, context }) => {
  await login(page);

  // Each phase gets a fresh tab: navigations in a tab that just processed a
  // server action can hang while the action's response stream lingers.
  async function setPrice(value: string): Promise<string> {
    const admin = await context.newPage();
    await admin.goto("/admin/products/beaver-river-access");
    const priceField = admin.locator('input[name="price"]');
    const previous = await priceField.inputValue();
    await priceField.fill(value);
    await admin.getByRole("button", { name: /save changes/i }).click();
    await expect(admin).toHaveURL(/\/admin\/products$/, { timeout: 15000 });
    await admin.close();
    return previous;
  }

  async function expectCardPrice(text: string) {
    const pub = await context.newPage();
    await expect(async () => {
      await pub.goto("/");
      await expect(pub.locator('a[href="/products/beaver-river-access"]')).toContainText(text);
    }).toPass({ timeout: 30000 });
    await pub.close();
  }

  const originalPrice = await setPrice("119");
  await expectCardPrice("CA$119.00");

  // Restore the original price
  await setPrice(originalPrice);
  await expectCardPrice(`CA$${Number(originalPrice).toFixed(2)}`);
});

// ── Column sorting (view-only) + manual mode ──────────────────────────────────

test("admin column sort orders by title; ⠿ returns to draggable manual order", async ({ page }) => {
  await login(page);

  const paintings = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^paintings/i }) });

  // Default view is a sorted view — rows are not draggable
  await expect(paintings.locator("tbody tr").first()).toHaveAttribute("draggable", "false");

  // Sort by Title ascending and verify the order
  await paintings.getByRole("button", { name: "Title" }).click();
  const titles = await paintings.locator("tbody tr td:nth-child(3) p.font-medium").allTextContents();
  const sorted = [...titles].sort((a, b) => a.localeCompare(b));
  expect(titles).toEqual(sorted);

  // ⠿ switches to manual order — rows become draggable
  await paintings.getByRole("button", { name: "⠿" }).click();
  await expect(paintings.locator("tbody tr").first()).toHaveAttribute("draggable", "true");
});

// ── Drag-to-reorder round-trip ────────────────────────────────────────────────

test("drag-to-reorder moves a row and persists; restored after", async ({ page }) => {
  await login(page);

  const paintings = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: /^paintings/i }) });

  // Enter manual order mode
  await paintings.getByRole("button", { name: "⠿" }).click();
  const rows = paintings.locator("tbody tr");
  await expect(rows.first()).toHaveAttribute("draggable", "true");

  const titleCell = (i: number) => rows.nth(i).locator("td:nth-child(3) p.font-medium");
  const first = (await titleCell(0).textContent())!.trim();
  const second = (await titleCell(1).textContent())!.trim();

  // Drag row 0 onto row 1 → they swap (dragTo performs a real HTML5 drag).
  // Wait for the reorder server action to persist before the next step.
  const firstSave = page.waitForResponse((r) => r.request().method() === "POST");
  await rows.nth(0).dragTo(rows.nth(1));
  await expect(titleCell(0)).toHaveText(second);
  await expect(titleCell(1)).toHaveText(first);
  await firstSave;

  // Drag back to restore the original order
  const secondSave = page.waitForResponse((r) => r.request().method() === "POST");
  await rows.nth(1).dragTo(rows.nth(0));
  await expect(titleCell(0)).toHaveText(first);
  await expect(titleCell(1)).toHaveText(second);
  await secondSave;
});

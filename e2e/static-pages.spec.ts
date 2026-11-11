import { test, expect } from "./test";

// ── For Artists page ──────────────────────────────────────────────────────────

test("For Artists is reachable from the header and shows the pitch", async ({ page }) => {
  await page.goto("/");
  await page.locator('header nav a[data-audience="artists"]').click();

  await expect(page).toHaveURL(/\/for-artists/);
  await expect(page.getByRole("heading", { name: "For Artists" })).toBeVisible();

  // Pitch: the comparison cards + the CTA, which goes to the booking page
  // rather than the general contact form — /book asks a prospective client the
  // questions worth asking, and its reader is not someone enquiring about a
  // painting.
  //
  // The cards used to headline a price ("one-time build, then ≈ $0") and this
  // asserted on that string. The page no longer argues on price, because the
  // honest numbers are close and the free-tier claim was not true for a site
  // that sells things. Ownership is the claim now, so that is what is pinned.
  await expect(page.getByText(/you never own it/i)).toBeVisible();
  await expect(page.getByText(/you own the asset/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /what it actually costs/i })).toBeVisible();
  const cta = page.getByRole("link", { name: /book a free 15-minute chat/i });
  await expect(cta).toHaveAttribute("href", "/book");

  // The label has to match where it lands: a button that says one thing and
  // opens another is a surprise at the moment someone decides to act.
  await cta.click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByRole("heading", { name: /tell me about your work/i })).toBeVisible();
  await page.goBack();

  // The architecture lives on its own page now; the pitch links to it.
  await page.getByRole("link", { name: /see the architecture/i }).click();
  await expect(page).toHaveURL(/\/architecture$/);
});

test("Architecture is in the footer and covers the system section by section", async ({ page }) => {
  await page.goto("/");
  // The header menu is the storefront, Contact last; Architecture, whose reader
  // is an engineer rather than someone browsing the work, is in the footer.
  const navLinks = page.locator("header nav a:not([data-audience])");
  await expect(navLinks.last()).toHaveAttribute("href", "/contact");
  await expect(page.locator('header a[href="/architecture"]')).toHaveCount(0);
  await page.getByRole("navigation", { name: "More" }).getByRole("link", { name: "Architecture" }).click();
  await expect(page).toHaveURL(/\/architecture$/);

  await expect(page.getByRole("heading", { level: 1, name: "Architecture" })).toBeVisible();
  for (const section of [
    "Runtime request path",
    "CI/CD & deployment topology",
    "Data model",
    "Key flows",
    "Security & privacy",
    "Security testing & resilience",
    "Backups & durability",
    "Repository map",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(section) })).toBeVisible();
  }
});

// ── FAQ accordion ─────────────────────────────────────────────────────────────

test("no word runs into the inline formatting before it", async ({ request }) => {
  // The production compiler drops the leading space of a JSX text run that
  // contains an HTML entity (&rsquo;, &nbsp;): "<strong>…limit</strong> is
  // raised to 4.5&nbsp;MB" rendered as "limitis raised". It hit the
  // Architecture page five times and nothing else caught it. The source looks
  // right, so this checks the HTML the server actually sends; the fix is an
  // explicit {" "} after the closing tag.
  for (const path of ["/architecture", "/architecture/tests", "/for-artists", "/about", "/making-of", "/book", "/contact"]) {
    const html = await (await request.get(path)).text();
    // Elements with text only: an empty <i> is a decorative corner, not a word.
    const runTogether = html.match(/>[^<]*[^<\s]<\/(strong|code|em|b|i)>[A-Za-z][^<]{0,20}/g) ?? [];
    expect(runTogether, `${path}: ${runTogether.join(" | ")}`).toEqual([]);
  }
});

test("every kind of response carries the security headers", async ({ request }) => {
  // Pages, the admin login and an API route: next.config.ts applies
  // lib/security-headers.ts to all of them, and a route that slipped through
  // would be the one a scanner finds.
  for (const path of ["/", "/architecture", "/admin/login", "/sitemap.xml"]) {
    const res = await request.get(path);
    const h = res.headers();
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(h["cross-origin-resource-policy"], path).toBe("same-origin");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
  const api = await request.post("/api/buy", { data: {} });
  expect(api.headers()["x-content-type-options"]).toBe("nosniff");
  // API responses carry the lock-down policy; pages carry the nonce one.
  expect(api.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  // So does a missing image: the proxy skips image paths, and its 404 page
  // once went out with no policy at all (the weekly ZAP scan).
  const missing = await request.get("/paintings/no-such-work.jpg");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-security-policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
});

test("the old FAQ address lands on the FAQ, now part of FAQ & Contact", async ({ page, request }) => {
  const res = await request.get("/faq", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/contact#faq");
  await page.goto("/faq");
  await expect(page).toHaveURL(/\/contact#faq$/);
  await expect(page.getByRole("heading", { name: "Frequently Asked Questions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contact Us" })).toBeVisible();
});

test("FAQ accordion opens and closes on click", async ({ page }) => {
  await page.goto("/contact");

  const first = page.locator("details").first();
  await expect(first).not.toHaveJSProperty("open", true);

  await first.locator("summary").click();
  await expect(first).toHaveJSProperty("open", true);

  await first.locator("summary").click();
  await expect(first).toHaveJSProperty("open", false);
});

// ── Sitemap ───────────────────────────────────────────────────────────────────

test("the numbered Architecture sections start collapsed and open from their headings", async ({ page }) => {
  await page.goto("/architecture");
  const sections = page.locator("details[data-section]");
  expect(await sections.count()).toBeGreaterThan(10);
  // All closed, but every heading is still there to read, in order, so the
  // headings themselves are the table of contents.
  expect(await sections.evaluateAll((ds) => ds.filter((d) => (d as HTMLDetailsElement).open).length)).toBe(0);
  await expect(page.getByRole("heading", { name: /^1 · Executive summary/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^10 · Security testing/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Contents" })).toHaveCount(0);

  // The heading opens its section, and closes it again.
  const security = page.locator("details#security-testing");
  await security.locator("summary").click();
  await expect(security).toHaveJSProperty("open", true);
  await security.locator("summary").click();
  await expect(security).toHaveJSProperty("open", false);

  // Expand all / Collapse all.
  await page.getByRole("button", { name: "Expand all" }).click();
  expect(await sections.evaluateAll((ds) => ds.every((d) => (d as HTMLDetailsElement).open))).toBe(true);
  await page.getByRole("button", { name: "Collapse all" }).click();
  expect(await sections.evaluateAll((ds) => ds.some((d) => (d as HTMLDetailsElement).open))).toBe(false);

  // A deep link from elsewhere lands on an open section.
  await page.goto("/architecture#cicd");
  await expect(page.locator("details#cicd")).toHaveJSProperty("open", true);
});

test("the test inventory is linked from Architecture and lists every test by name", async ({ page }) => {
  // The link is in §8, which starts collapsed; a deep link opens it.
  await page.goto("/architecture#guards");
  await page.locator("details#guards").getByRole("link", { name: "test inventory" }).click();
  await expect(page).toHaveURL(/\/architecture\/tests$/);
  await expect(page.getByRole("heading", { level: 1, name: "Test inventory" })).toBeVisible();

  // This very test is in the list, under its own file.
  const file = page.locator("details", { has: page.locator("summary", { hasText: "e2e/static-pages.spec.ts" }) });
  await file.locator("summary").click();
  await expect(file.getByText("the test inventory is linked from Architecture and lists every test by name")).toBeVisible();
});

test("sitemap.xml lists static, gift-shop, and product pages", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);

  const xml = await res.text();
  expect(xml).toContain("/for-artists");
  expect(xml).toContain("/architecture");
  expect(xml).toContain("/architecture/tests");
  expect(xml).toContain("/gift-shop");
  expect(xml).toContain("/products/peasemarsh");
  expect(xml).toContain("/photographs/");
});

// ── JSON-LD structured data ───────────────────────────────────────────────────

test("product detail page carries Product JSON-LD with an offer", async ({ page }) => {
  await page.goto("/products/peasemarsh");

  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const product = blocks
    .map((b) => {
      try {
        return JSON.parse(b);
      } catch {
        return null;
      }
    })
    .find((j) => j && j["@type"] === "Product");

  expect(product).toBeTruthy();
  expect(product.name).toContain("Peasemarsh");
  expect(product.offers).toBeTruthy();
  expect(JSON.stringify(product.offers)).toContain("CAD");
});

// ── "In a Room" view switcher ─────────────────────────────────────────────────

test("In a Room switcher toggles the room mockup view", async ({ page }) => {
  await page.goto("/products/peasemarsh");

  const roomButton = page.getByRole("button", { name: /view in a room/i });
  await expect(roomButton).toHaveAttribute("aria-pressed", "false");

  await roomButton.click();
  await expect(roomButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByAltText(/shown in a room/i).first()).toBeVisible();

  // Toggles back to the painting
  await roomButton.click();
  await expect(roomButton).toHaveAttribute("aria-pressed", "false");
});

// ── Mobile navigation ─────────────────────────────────────────────────────────

test("mobile hamburger menu opens and navigates", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const hamburger = page.getByRole("button", { name: "Menu", exact: true });
  await expect(hamburger).toBeVisible();
  await hamburger.click();

  await page.locator('header a[href="/contact"]:visible').first().click();
  await expect(page).toHaveURL(/\/contact/);
});

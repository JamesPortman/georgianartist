import { test, expect, type Page } from "./test";
import { products } from "../data/products";
import { PHOTO_WITH_MAP } from "./fixtures";

/**
 * The Content-Security-Policy is enforced (lib/csp.ts). This is the check that
 * keeps that safe: every page type loads with the policy on, and any violation
 * the browser raises — a script without the nonce, an unlisted host — fails
 * the test by name, before a real visitor's browser would block it. It was
 * what made flipping from report-only safe, and it is what makes a new
 * third-party host a CI failure rather than a broken page.
 */

async function collectViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(
        `${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"}`
      );
    });
  });
}

const PAINTING = products.find((p) => !p.soldOut)!.id;
const PAGES = [
  "/",
  `/products/${PAINTING}`,
  "/photographs",
  `/photographs/${PHOTO_WITH_MAP}`, // the embedded OpenStreetMap iframe
  "/locations",
  "/making-of",
  "/gift-shop",
  "/gift-shop/calendar",
  "/about",
  "/contact",
  "/for-artists",
  "/architecture",
  "/architecture/tests",
  "/book",
  "/admin/login",
];

test("every page is served with the policy and a fresh nonce", async ({ request }) => {
  const header = (h: Record<string, string>) =>
    h["content-security-policy"] ?? h["content-security-policy-report-only"] ?? "";
  const a = header((await request.get("/")).headers());
  const b = header((await request.get("/")).headers());
  expect(a).toMatch(/script-src [^;]*'nonce-[^']+'/);
  expect(a.match(/'nonce-([^']+)'/)![1]).not.toBe(b.match(/'nonce-([^']+)'/)![1]);
});

for (const path of PAGES) {
  test(`no CSP violations on ${path}`, async ({ page }) => {
    await collectViolations(page);
    const res = await page.goto(path);
    // No violations proves nothing if the page had no policy to violate — the
    // /photographs pages once shipped without one and passed this test.
    const h = res!.headers();
    const policy = h["content-security-policy"] ?? h["content-security-policy-report-only"] ?? "";
    expect(policy, `${path} served without a nonce policy`).toMatch(/'nonce-[^']+'/);
    await page.waitForLoadState("networkidle");
    const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    expect(violations).toEqual([]);
  });
}

const violationsOn = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test("no CSP violations when a film is played", async ({ page }) => {
  // The browser checks media-src before it requests the file, so aborting the
  // request still catches a blocked film — without pulling 10-30MB through CI.
  await collectViolations(page);
  await page.route(/\.mp4(\?|$)/, (route) => route.abort());
  await page.goto("/making-of");
  await page.getByRole("link", { name: /Play the film of/ }).first().click();
  await expect(page.locator("video").first()).toBeAttached();
  expect(await violationsOn(page)).toEqual([]);
});

test("no CSP violations across the signed-in admin", async ({ page }) => {
  // The admin gets its own variant of the policy (blob: workers and eval, for
  // the HEIC converter), so it is checked separately. The admin re-navigates
  // itself just after each load, so instead of reading a page-side list this
  // listens for the browser's own CSP console messages, which survive that.
  const found: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) found.push(`${page.url()}: ${m.text().slice(0, 200)}`);
  });

  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill(process.env.ADMIN_PASSWORD ?? "localdev");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/products/);

  for (const path of ["/admin/products/new", "/admin/instagram", "/admin/analytics", "/admin/products"]) {
    await page.goto(path, { waitUntil: "commit" }).catch(() => {});
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(750);
  }
  expect(found).toEqual([]);
});

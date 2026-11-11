import { test, expect } from "./test";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "localdev";

test("admin login rejects a wrong password", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill("definitely-not-the-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/incorrect password/i)).toBeVisible();
});

test("admin login accepts the correct password and reaches the product list", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/admin\/products/);
  await expect(page.getByRole("heading", { name: /paintings/i })).toBeVisible();
});

test("unauthenticated access to the admin redirects to login", async ({ page }) => {
  await page.goto("/admin/products");
  await expect(page).toHaveURL(/\/admin\/login/);
});

// ZAP's rule 10044 flags these redirects as "big": Next streams the public
// shell (banner, header, footer) before the page's redirect() runs, so the
// body is ~15 KB. .zap/rules.tsv accepts that for /admin on the strength of
// this test: the body must carry nothing the signed-in page shows. /admin
// itself goes to /admin/products, which sends a signed-out visitor to sign in.
test("a signed-out admin redirect carries no admin data", async ({ request }) => {
  for (const path of ["/admin", "/admin/products", "/admin/analytics"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers()["location"], path).toMatch(path === "/admin" ? /\/admin\/products/ : /\/admin\/login/);
    const body = await res.text();
    for (const leak of ["Council Beach", "Lora Bay", "Page views", "Visitors"]) {
      expect(body, `${path} leaks "${leak}"`).not.toContain(leak);
    }
  }
});

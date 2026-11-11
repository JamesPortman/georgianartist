import { test, expect } from "./test";

// The login limiter keys on x-forwarded-for, so a spoofed unique IP isolates
// this spec from every other login test (and from CI retries, which get a
// fresh random IP instead of an already-locked one).

test("admin login locks out after 5 failed attempts", async ({ browser }) => {
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${
    Math.floor(Math.random() * 250) + 1
  }`;
  const context = await browser.newContext({
    baseURL: "http://localhost:3000", // newContext doesn't inherit the config baseURL
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();

  // 5 wrong passwords → each rejected normally
  for (let i = 0; i < 5; i++) {
    await page.goto("/admin/login");
    await page.getByLabel(/password/i).fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/incorrect password/i)).toBeVisible();
  }

  // 6th attempt → locked out before the password is even checked
  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill("wrong-password-final");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/too many attempts/i)).toBeVisible();

  await context.close();
});

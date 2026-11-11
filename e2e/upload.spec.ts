import { test, expect } from "./test";
import path from "node:path";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "localdev";

// Real upload hits Vercel Blob — only run when a token is configured.
// This test uploads to the real, shared Vercel Blob store — there is no test
// store. That makes it unsafe to run automatically in CI: a failed run leaves
// an orphaned blob behind, and because the app uploads with addRandomSuffix
// false, that leftover then makes every later run fail on overwrite. It is
// opt-in via RUN_BLOB_UPLOAD_E2E=1 for local verification against a store you
// are willing to write to.
test.skip(
  !process.env.BLOB_READ_WRITE_TOKEN || process.env.RUN_BLOB_UPLOAD_E2E !== "1",
  "needs BLOB_READ_WRITE_TOKEN and RUN_BLOB_UPLOAD_E2E=1 (writes to the shared Blob store)"
);

test("admin can upload a new painting and it appears in the list", async ({ page }) => {
  // accept the delete-confirm dialog during cleanup
  page.on("dialog", (d) => d.accept());

  // log in
  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/products/);

  // new product form
  await page.goto("/admin/products/new");
  await page.setInputFiles(
    'input[name="image"]',
    // A real catalogue image, kept here as a fixture since the catalogue moved to Blob.
    path.join(process.cwd(), "e2e/assets/council-beach.jpg")
  );

  // client-side processing should auto-detect the size type
  await expect(page.locator('select[name="sizeType"]')).not.toHaveValue("", { timeout: 30000 });

  await page.locator('input[name="title"]').fill("E2E Upload Test");
  await page.locator('input[name="category"]').fill("Test");
  await page.getByRole("button", { name: /create product/i }).click();

  // redirected back to the list with the new product visible
  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 30000 });
  const row = page.locator("tr", { hasText: "E2E Upload Test" });
  await expect(row).toBeVisible();

  // cleanup — delete the test product
  await row.getByRole("button", { name: /delete/i }).click();
  await expect(page.locator("tr", { hasText: "E2E Upload Test" })).toHaveCount(0);
});

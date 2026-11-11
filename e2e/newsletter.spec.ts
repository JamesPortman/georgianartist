import { test, expect } from "./test";

// The Studio List signup posts to Kit (ConvertKit); mock the external endpoint.

test("newsletter signup shows confirmation on success", async ({ page }) => {
  await page.route("https://app.kit.com/forms/**", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ status: "success" }), contentType: "application/json" })
  );

  await page.goto("/");

  await page.getByLabel("Email address").fill("collector@example.com");
  await page.getByRole("button", { name: /subscribe/i }).click();

  await expect(page.getByText(/check your email to confirm/i)).toBeVisible();
  // The form is replaced by the confirmation
  await expect(page.getByRole("button", { name: /subscribe/i })).toHaveCount(0);
});

test("newsletter signup shows an error message when the subscribe fails", async ({ page }) => {
  await page.route("https://app.kit.com/forms/**", (route) =>
    route.fulfill({ status: 500, body: "{}", contentType: "application/json" })
  );

  await page.goto("/");

  await page.getByLabel("Email address").fill("collector@example.com");
  await page.getByRole("button", { name: /subscribe/i }).click();

  await expect(page.getByText(/something went wrong/i)).toBeVisible();
});

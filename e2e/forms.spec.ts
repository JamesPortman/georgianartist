import { test, expect } from "./test";

// ── Contact form ──────────────────────────────────────────────────────────────

test("contact form renders all fields and submit button", async ({ page }) => {
  await page.goto("/contact");

  await expect(page.getByRole("heading", { name: /contact us/i })).toBeVisible();
  await expect(page.getByLabel(/name/i)).toBeVisible();
  await expect(page.getByRole("main").getByLabel(/email/i)).toBeVisible();
  await expect(page.getByLabel(/message/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /send message/i })).toBeVisible();
});

test("contact form shows confirmation after successful submission", async ({ page }) => {
  await page.route("/api/contact", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }), contentType: "application/json" })
  );

  await page.goto("/contact");

  await page.getByLabel(/name/i).fill("Jane Smith");
  await page.getByRole("main").getByLabel(/email/i).fill("jane@example.com");
  await page.getByLabel(/message/i).fill("I love your Georgian Bay paintings!");
  await page.getByRole("button", { name: /send message/i }).click();

  await expect(page.getByText(/message has been sent/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /send message/i })).not.toBeVisible();
});

test("contact form shows error message on API failure", async ({ page }) => {
  await page.route("/api/contact", (route) =>
    route.fulfill({ status: 500, body: JSON.stringify({ error: "Failed" }), contentType: "application/json" })
  );

  await page.goto("/contact");

  await page.getByLabel(/name/i).fill("Jane Smith");
  await page.getByRole("main").getByLabel(/email/i).fill("jane@example.com");
  await page.getByLabel(/message/i).fill("Test message");
  await page.getByRole("button", { name: /send message/i }).click();

  await expect(page.getByText(/please try again/i)).toBeVisible();
});

// ── Buy Now form ──────────────────────────────────────────────────────────────

test("Buy Now button expands into an enquiry form", async ({ page }) => {
  await page.goto("/products/peasemarsh");

  // Initially shows the button, not the form
  await expect(page.getByRole("button", { name: "Buy Now" })).toBeVisible();
  await expect(page.getByLabel(/name/i)).not.toBeVisible();

  await page.getByRole("button", { name: "Buy Now" }).click();

  await expect(page.getByLabel(/name/i)).toBeVisible();
  await expect(page.getByRole("main").getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /send enquiry/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
});

test("Buy Now Cancel button restores the Buy Now button", async ({ page }) => {
  await page.goto("/products/peasemarsh");

  await page.getByRole("button", { name: "Buy Now" }).click();
  await expect(page.getByLabel(/name/i)).toBeVisible();

  await page.getByRole("button", { name: /cancel/i }).click();

  await expect(page.getByRole("button", { name: "Buy Now" })).toBeVisible();
  await expect(page.getByLabel(/name/i)).not.toBeVisible();
});

test("Buy Now form shows confirmation after successful submission", async ({ page }) => {
  await page.route("/api/buy", (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ ok: true }), contentType: "application/json" })
  );

  await page.goto("/products/peasemarsh");

  await page.getByRole("button", { name: "Buy Now" }).click();
  await page.getByLabel(/name/i).fill("John Buyer");
  await page.getByRole("main").getByLabel(/email/i).fill("john@example.com");
  await page.getByLabel(/phone/i).fill("555-123-4567");
  await page.getByLabel(/shipping address/i).fill("123 Test St, Collingwood, ON");
  await page.getByRole("button", { name: /send enquiry/i }).click();

  await expect(page.getByText(/enquiry sent/i)).toBeVisible();
});

test("Buy Now form shows error message on API failure", async ({ page }) => {
  await page.route("/api/buy", (route) =>
    route.fulfill({ status: 500, body: JSON.stringify({ error: "Failed" }), contentType: "application/json" })
  );

  await page.goto("/products/peasemarsh");

  await page.getByRole("button", { name: "Buy Now" }).click();
  await page.getByLabel(/name/i).fill("John Buyer");
  await page.getByRole("main").getByLabel(/email/i).fill("john@example.com");
  await page.getByLabel(/phone/i).fill("555-123-4567");
  await page.getByLabel(/shipping address/i).fill("123 Test St, Collingwood, ON");
  await page.getByRole("button", { name: /send enquiry/i }).click();

  await expect(page.getByText(/please try again/i)).toBeVisible();
});

// ── Booking form (/book) ──────────────────────────────────────────────────────

test("booking form confirms after a successful submission", async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  await page.route("/api/book", async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/book");
  await page.getByLabel("Your name").fill("Pat Painter");
  await page.getByRole("main").getByLabel("Email").fill("pat@example.com");
  await page.getByLabel(/anything you.d like the site to do/i).fill("Sell prints of my watercolours.");
  await page.getByRole("button", { name: /send it to james/i }).click();

  await expect(page.getByRole("status").filter({ hasText: /got it/i })).toBeVisible();
  expect(payload).toMatchObject({ name: "Pat Painter", email: "pat@example.com" });
});

test("booking form offers other ways to reach James when sending fails", async ({ page }) => {
  await page.route("/api/book", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Server error" }) })
  );

  await page.goto("/book");
  await page.getByLabel("Your name").fill("Pat Painter");
  await page.getByRole("main").getByLabel("Email").fill("pat@example.com");
  await page.getByRole("button", { name: /send it to james/i }).click();

  // By text: Next's route announcer is also role="alert", and empty.
  const alert = page.getByRole("alert").filter({ hasText: /try again/i });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("link", { name: /@/ })).toBeVisible();
});

// ── Before JavaScript runs ────────────────────────────────────────────────────
//
// Every form here is sent by JavaScript. Before hydration, or with JavaScript
// off, the browser submits it natively instead — and a form with no method
// submits as GET, so the visitor's name, email and message land in the URL,
// where GA4 records them as the page address. The ZAP scan in CI caught the
// contact form doing exactly that.

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of ["/", "/contact", "/book", "/products/lora-bay"]) {
    test(`${path}: every form posts`, async ({ page }) => {
      await page.goto(path);
      const methods = await page
        .locator("form")
        .evaluateAll((forms) => forms.map((f) => (f as HTMLFormElement).method));
      expect(methods.length, "no forms found").toBeGreaterThan(0);
      expect(methods.every((m) => m === "post"), methods.join(", ")).toBe(true);
    });
  }

  test("a contact form sent before JavaScript runs keeps its fields out of the URL", async ({ page }) => {
    await page.goto("/contact");
    await page.getByLabel(/name/i).fill("No Script");
    await page.getByRole("main").getByLabel(/email/i).fill("noscript@example.com");
    await page.getByLabel(/message/i).fill("Sent with JavaScript switched off.");
    await Promise.all([
      page.waitForURL(/\/contact/),
      page.getByRole("button", { name: /send message/i }).click(),
    ]);
    expect(page.url()).not.toContain("?");
    expect(page.url()).not.toContain("noscript");
  });
});

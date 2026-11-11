import { test, expect, type Page } from "./test";
import { prisma } from "../lib/db";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "localdev";

// The admin's passkey, end to end: register one from the Security page, then
// sign in with it — a real WebAuthn ceremony, answered by Chromium's virtual
// authenticator (a software passkey with "user verified" always true).
//
// The suite runs with ADMIN_PASSWORD_LOGIN=1 (e2e.yml), the break-glass that
// keeps the password working while a passkey exists — otherwise the moment
// this spec registered one, every other admin spec's password sign-in would
// be refused. That refusal itself is covered by __tests__/passkey.test.ts.
// Passkeys are cleared before and after, here and in global-setup.

test.describe.configure({ mode: "serial" });

async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test.beforeAll(async () => {
  await prisma.adminPasskey.deleteMany({});
});
test.afterAll(async () => {
  await prisma.adminPasskey.deleteMany({});
});

test("register a passkey, then sign in with it instead of the password", async ({ page }) => {
  await addVirtualAuthenticator(page);

  // Before any passkey: the password form, and no passkey button.
  await page.goto("/admin/login");
  await expect(page.getByRole("button", { name: /passkey/i })).toHaveCount(0);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin\/products/);

  // Register one on the Security page.
  await page.goto("/admin/security");
  await expect(page.getByText("None yet.")).toBeVisible();
  await page.getByLabel("Name for this passkey").fill("E2E virtual authenticator");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText(/Passkey added/)).toBeVisible();
  await expect(page.getByTestId("passkey-list").getByText("E2E virtual authenticator")).toBeVisible();
  const stored = await prisma.adminPasskey.findMany();
  expect(stored).toHaveLength(1);
  expect(stored[0]!.publicKey.length).toBeGreaterThan(40);

  // Sign out, and sign back in with the passkey.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/admin\/products/);
  const used = await prisma.adminPasskey.findUniqueOrThrow({ where: { id: stored[0]!.id } });
  expect(used.lastUsedAt).not.toBeNull();
});

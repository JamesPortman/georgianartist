import { test, expect, type Page } from "./test";
import { prisma } from "../lib/db";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "localdev";

// The Instagram queue at /admin/instagram: nothing publishes unapproved, so the
// review step is the part worth pinning. Approving gives a post the next free
// Mon/Wed/Fri slot, unapproving puts it back, and skipping takes it out of the
// queue. Publishing itself calls the Graph API and is never exercised here.
//
// The seed has no queued posts, so this spec creates its own, marked so they
// can be found and removed. db-guard (globalSetup) has already refused to run
// against anything but a local database.

const MARK = "[e2e-queue]";

async function makePost(caption: string) {
  return prisma.instagramPost.create({
    data: {
      type: "painting",
      productId: "lora-bay",
      imageUrl: "/paintings/lora-bay.jpg",
      caption: `${MARK} ${caption}`,
    },
  });
}

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/admin\/products/);
}

// Both tests clear the marked rows, so they must not run side by side.
test.describe.configure({ mode: "serial" });

const card = (page: Page, id: string) => page.locator(`[data-post-id="${id}"]`);

test.beforeEach(async () => {
  await prisma.instagramPost.deleteMany({ where: { caption: { startsWith: MARK } } });
});
test.afterAll(async () => {
  await prisma.instagramPost.deleteMany({ where: { caption: { startsWith: MARK } } });
});

test("approving schedules a post on a Mon/Wed/Fri, and unapproving puts it back", async ({ page }) => {
  const post = await makePost("approve me");
  await login(page);
  await page.goto("/admin/instagram");

  await expect(card(page, post.id)).toHaveAttribute("data-status", "pending");
  await card(page, post.id).getByRole("button", { name: /approve/i }).click();

  await expect(card(page, post.id)).toHaveAttribute("data-status", "approved");
  await expect(card(page, post.id).getByText(/scheduled:/i)).toBeVisible();
  const saved = await prisma.instagramPost.findUniqueOrThrow({ where: { id: post.id } });
  expect(saved.status).toBe("approved");
  // Mon, Wed or Fri — the posting days (lib/instagram.ts nextPostingSlot).
  expect([1, 3, 5]).toContain(saved.scheduledAt!.getUTCDay());

  await card(page, post.id).getByRole("button", { name: /unapprove/i }).click();
  await expect(card(page, post.id)).toHaveAttribute("data-status", "pending");
  const back = await prisma.instagramPost.findUniqueOrThrow({ where: { id: post.id } });
  expect(back).toMatchObject({ status: "pending", scheduledAt: null });
});

test("skipping takes a post out of the queue for good", async ({ page }) => {
  const post = await makePost("skip me");
  await login(page);
  await page.goto("/admin/instagram");

  page.once("dialog", (d) => d.accept()); // "Skip this post? It won't be queued again."
  await card(page, post.id).getByRole("button", { name: /^skip$/i }).click();

  await expect(card(page, post.id)).toHaveCount(0);
  const saved = await prisma.instagramPost.findUniqueOrThrow({ where: { id: post.id } });
  expect(saved.status).toBe("skipped");
});

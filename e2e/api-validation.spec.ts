import { test, expect } from "./test";
import { products } from "../data/products";

// These hit the real route handlers (no page.route mocks). Every case below
// returns before any email is sent, so no Resend/API key is needed.

// ── /api/buy ──────────────────────────────────────────────────────────────────

test("/api/buy rejects a request with missing required fields", async ({ request }) => {
  const res = await request.post("/api/buy", { data: {} });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/missing required fields/i);
});

test("/api/buy silently accepts honeypot submissions without sending", async ({ request }) => {
  const res = await request.post("/api/buy", {
    data: {
      title: "Spam Target",
      name: "Bot Bot",
      email: "bot@example.com",
      phone: "000",
      address: "nowhere",
      website: "http://spam.example.com", // honeypot field — humans never fill this
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
});

test("/api/buy refuses an order the catalogue can't back, before sending anything", async ({ request }) => {
  // The browser sends ids and choices; the server looks up the title and
  // price. A size this work isn't sold in, or a work that doesn't exist, is
  // refused — so the confirmation email can never carry posted text.
  const work = products.find((p) => !p.soldOut)!;
  const person = { name: "Jane Smith", email: "jane@example.com", phone: "555 0100", address: "1 Main St" };

  const badSize = await request.post("/api/buy", {
    data: { order: { kind: "print", productId: work.id, size: "Pay at evil.example" }, ...person },
  });
  expect(badSize.status()).toBe(400);
  expect((await badSize.json()).error).toMatch(/size/i);

  const noWork = await request.post("/api/buy", {
    data: { order: { kind: "print", productId: "no-such-work", size: "12x16" }, ...person },
  });
  expect(noWork.status()).toBe(400);
});

// ── /api/contact ──────────────────────────────────────────────────────────────

test("/api/contact rejects a request with missing required fields", async ({ request }) => {
  const res = await request.post("/api/contact", { data: {} });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/missing required fields/i);
});

test("/api/contact rejects a single-word spam message", async ({ request }) => {
  const res = await request.post("/api/contact", {
    data: { name: "Jane Smith", email: "jane@example.com", message: "hello" },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toMatch(/longer message/i);
});

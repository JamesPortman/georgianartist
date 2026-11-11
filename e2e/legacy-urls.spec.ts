import { test, expect } from "./test";

// Old Squarespace product URLs (/home/p/<slug>) are still in Google's index and
// in other people's links. A work that still exists gets a permanent redirect
// to its page; anything that matches nothing is 410 Gone, so search engines drop
// it, never a soft redirect to the homepage (app/home/p/[slug]/route.ts).

test("an old Squarespace URL for a live work redirects permanently to its page", async ({ request }) => {
  const res = await request.get("/home/p/lora-bay", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/products/lora-bay");
});

test("an old URL nothing matches is 410 Gone, not a redirect home", async ({ request }) => {
  const res = await request.get("/home/p/aluminum-beaver-river-summary", { maxRedirects: 0 });
  expect(res.status()).toBe(410);
  expect(res.headers()["location"]).toBeUndefined();
  const html = await res.text();
  expect(html).toContain("This page is gone");
  expect(html).toContain('href="/"');
  // Script-free, and the slug is never echoed back.
  expect(html).not.toContain("<script");
  expect(html).not.toContain("aluminum-beaver-river-summary");
});

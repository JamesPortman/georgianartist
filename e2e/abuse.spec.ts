import { test, expect } from "./test";

// Abuse cases that stand in for part of a manual penetration test
// (/architecture §10). The weekly active ZAP scan (zap-full.yml) sprays the
// generic payloads; these pin the specific ways this site takes input.

// A payload that runs code if it is ever inserted as HTML rather than text.
const XSS = `"><img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;

for (const path of [
  `/?q=${encodeURIComponent(XSS)}`, // gallery search box
  `/photographs?q=${encodeURIComponent(XSS)}`,
  `/?category=${encodeURIComponent(XSS)}`,
  `/products/${encodeURIComponent(XSS)}`, // 404 page
  `/home/p/${encodeURIComponent(XSS)}`, // legacy URL resolver
]) {
  test(`reflected input stays text: ${path.slice(0, 40)}`, async ({ page, request }) => {
    // The server's HTML never carries it as markup...
    const html = await (await request.get(path, { maxRedirects: 0 })).text();
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>window.__xss");

    // ...and nothing the browser renders runs it.
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    expect(dialogs).toEqual([]);
  });
}

test("the public form APIs refuse an oversized body on the real server", async ({ request }) => {
  // lib/form-input.ts, end to end: the running build, not a unit harness.
  const huge = "word ".repeat(10_000);
  for (const path of ["/api/contact", "/api/buy", "/api/book"]) {
    const res = await request.post(path, {
      data: { name: "Jane Smith", email: "jane@example.com", message: huge, address: huge, notes: huge, elapsedMs: 60_000 },
    });
    expect(res.status(), path).toBe(413);
  }
});

test("an admin page without a session is never served, only redirected", async ({ request }) => {
  for (const path of ["/admin/products", "/admin/instagram", "/admin/analytics", "/admin/products/new"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect([302, 303, 307, 308], path).toContain(res.status());
    expect(res.headers()["location"], path).toMatch(/\/admin\/login/);
  }
});

test("security.txt tells a finder where to report, and stays current", async ({ request }) => {
  const res = await request.get("/.well-known/security.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/^text\/plain/);
  const body = await res.text();
  expect(body).toMatch(/^Contact: mailto:\S+@\S+$/m);
  const expires = new Date(body.match(/^Expires: (.+)$/m)![1]!);
  expect(expires.getTime()).toBeGreaterThan(Date.now());
});

import { describe, it, expect } from "vitest";
import { pageOf } from "@/lib/server-event";

// The page a form outcome is filed under comes from the Referer header, which
// the visitor controls: it must never file an event under an API or admin path.
describe("pageOf", () => {
  const req = (referer?: string) =>
    new Request("http://localhost/api/contact", { method: "POST", headers: referer ? { referer } : {} });

  it("uses the page the form was posted from", () => {
    expect(pageOf(req("https://www.georgianartist.com/products/lora-bay?x=1"), "/")).toBe("/products/lora-bay");
  });

  it.each([
    ["no Referer", undefined],
    ["a malformed one", "not a url"],
    ["an API path", "https://www.georgianartist.com/api/track"],
    ["an admin path", "https://www.georgianartist.com/admin/analytics"],
  ])("falls back with %s", (_label, referer) => {
    expect(pageOf(req(referer), "/contact")).toBe("/contact");
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Every E2E spec takes `test` from e2e/test.ts, whose fixture keeps a page's
 * `/_next/image` requests alive after the page has moved on. A spec importing
 * `test` from @playwright/test directly would run without it, and one that logs
 * in and leaves the admin while its thumbnails load can hang the image
 * optimizer for the rest of the run — which then fails some later, unrelated
 * spec, as zz-admin-manage failed for weeks. See e2e/test.ts.
 *
 * Type-only `import("@playwright/test").Page` annotations are fine: they bring
 * in no `test`.
 */
describe("E2E specs use the shared test fixture", () => {
  const specs = fs.readdirSync("e2e").filter((f) => f.endsWith(".spec.ts"));

  it("finds the specs", () => {
    expect(specs.length).toBeGreaterThan(10);
  });

  it.each(specs)("%s imports from ./test, not @playwright/test", (file) => {
    const src = fs.readFileSync(`e2e/${file}`, "utf8");
    expect(src).not.toMatch(/from\s+["']@playwright\/test["']/);
    expect(src).toMatch(/from\s+["']\.\/test["']/);
  });
});

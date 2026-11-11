import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Every tick-box the server reads has to be a tick-box the form sends.
 *
 * Two bugs of exactly this shape were in the admin at once, found on the same
 * afternoon, and both failed silently:
 *
 *   - The update action read `soldOut`, but the edit form had no Sold field.
 *     An absent checkbox reads as unticked, so saving ANY edit on a sold-out
 *     work quietly put it back on sale — prices, Buy Now and all.
 *   - The create action read Visible as `!== "off"`. An unticked checkbox
 *     sends nothing rather than "off", so the test was always true and
 *     unticking Visible on the Add form did nothing: every new work went live.
 *
 * A browser checkbox only ever sends "on" or nothing. So the rules are:
 * compare with `=== "on"`, and never read a name the form does not render.
 * Checked against source rather than by driving the forms, because the risk is
 * the next field someone adds to one side and forgets on the other.
 */

const ACTIONS = fs.readFileSync("app/actions/admin.ts", "utf8");

/** The body of one exported async function, by brace matching. */
function body(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  if (start === -1) throw new Error(`no ${name} in app/actions/admin.ts`);
  let depth = 0;
  let opened = false;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") { depth++; opened = true; }
    else if (src[i] === "}" && --depth === 0 && opened) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

/** Checkbox names an action reads, i.e. `formData.get("x") === "on"`. */
function checkboxesRead(fn: string): string[] {
  return [...fn.matchAll(/formData\.get\("([a-zA-Z]+)"\)\s*===\s*"on"/g)].map((m) => m[1]!);
}

/** Every `name="x"` a form renders, across the form and the fields it includes. */
function namesRendered(files: string[]): Set<string> {
  const names = new Set<string>();
  for (const f of files) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/name="([a-zA-Z]+)"/g)) names.add(m[1]!);
  }
  return names;
}

const FORMS = {
  createProductAction: [
    "app/admin/products/new/NewProductForm.tsx",
    "app/admin/products/InspirationField.tsx",
    "app/admin/products/HomePhotoField.tsx",
  ],
  updateProductAction: [
    "app/admin/products/[id]/EditProductForm.tsx",
    "app/admin/products/InspirationField.tsx",
    "app/admin/products/HomePhotoField.tsx",
  ],
} as const;

describe("admin forms send every tick-box the server reads", () => {
  for (const [action, files] of Object.entries(FORMS)) {
    it(`${action}: no field is read that its form never sends`, () => {
      const rendered = namesRendered([...files]);
      const missing = checkboxesRead(body(ACTIONS, action)).filter((n) => !rendered.has(n));
      // Anything listed here reads as permanently unticked on save.
      expect(missing).toEqual([]);
    });
  }

  it("the Sold tick-box exists on both forms", () => {
    // Named explicitly: it is the one that un-sold a work on every edit.
    for (const files of Object.values(FORMS)) {
      expect(namesRendered([...files]).has("soldOut")).toBe(true);
    }
  });

  it('never tests a checkbox with !== "off"', () => {
    // A checkbox never sends "off". This comparison is always true, which is
    // how unticking Visible stopped meaning anything.
    expect(ACTIONS).not.toMatch(/formData\.get\("[a-zA-Z]+"\)\s*!==\s*"off"/);
  });
});

describe("a collector's photo is stored as theirs, not the artist's", () => {
  const upload = (() => {
    const start = ACTIONS.indexOf("async function uploadHomePhoto(");
    const end = ACTIONS.indexOf("\n}\n", start);
    return ACTIONS.slice(start, end);
  })();

  it("re-encodes the file rather than editing it", () => {
    // A phone photo taken in someone's kitchen carries their home's GPS.
    // Not stripMetadata(): it hands back anything that isn't a JPEG untouched,
    // GPS and all. home-photo.test.ts proves prepareHomePhoto() doesn't.
    expect(upload).toMatch(/prepareHomePhoto\(/);
    expect(upload).not.toMatch(/stripMetadata\(/);
  });

  it("does not stamp the artist's copyright on it", () => {
    // embedCopyright() names the artist as rights holder. The collector took
    // this photograph; the notice would be false.
    expect(upload).not.toMatch(/embedCopyright\(/);
  });

  it("keeps it in its own folder, apart from the artist's work", () => {
    expect(upload).toMatch(/`homes\//);
  });
});

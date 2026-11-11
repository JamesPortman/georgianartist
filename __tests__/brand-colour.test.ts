import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { BRAND } from "../lib/brand";

/**
 * The brand colour has to be defined twice — once as a Tailwind `@theme`
 * entry, which is what 180-odd class names resolve through, and once as a
 * JavaScript string for the few SVG and map values that cannot be a class.
 *
 * Two definitions is one more than ideal, and it is exactly how the site ended
 * up with four different hover greens in the first place. So the second copy
 * is pinned to the first here: change `app/globals.css` and this fails until
 * `lib/brand.ts` follows.
 *
 * It also guards the sweep itself. Every one of those class names now reads
 * `bg-brand` rather than `bg-[#2c5f2e]`, and a hex typed back in by hand would
 * render correctly while quietly re-opening the drift — so a stray literal
 * anywhere in the styled source fails too.
 */

const css = fs.readFileSync("app/globals.css", "utf8");

/** Read one `--color-*` value out of the @theme block. */
function themeColour(name: string): string {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!m) throw new Error(`No --color-${name} in app/globals.css`);
  return m[1]!.toLowerCase();
}

describe("brand colour", () => {
  it.each([
    ["brand", () => BRAND.green],
    ["brand-hover", () => BRAND.greenHover],
    ["brand-tint", () => BRAND.greenTint],
  ])("lib/brand.ts matches --color-%s in globals.css", (name, value) => {
    expect(value().toLowerCase()).toBe(themeColour(name));
  });

  it("defines the tokens inside @theme, so Tailwind generates the utilities", () => {
    // In :root they would still resolve through var(), but `bg-brand` and
    // friends would not exist and every swept class would silently no-op.
    const theme = css.match(/@theme\s*\{[\s\S]*?\}/)?.[0] ?? "";
    for (const n of ["--color-brand:", "--color-brand-hover:", "--color-brand-tint:"]) {
      expect(theme).toContain(n);
    }
  });
});

describe("no brand hex literals outside the definitions", () => {
  const LITERALS = /#(2c5f2e|245026|234d24|244d26|1e4220|f0f7f0)\b/i;
  // Where the colour is legitimately spelled out.
  const ALLOWED = new Set(["app/globals.css", "lib/brand.ts"]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p, out);
      else if (/\.(tsx?|css)$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it("every other file uses the token", () => {
    const offenders = [...walk("app"), ...walk("components"), ...walk("lib")]
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => LITERALS.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { siteConfig, bareDomain, mailFrom } from "../data/siteConfig";
import { ARTIST, CREDIT, SITE, EMAIL } from "../lib/copyright";

/**
 * Whose site this is should be one decision, not a hundred.
 *
 * The brand name was typed into 46 places, the domain into 36, and the two
 * could disagree without anything failing — which is how the footer once
 * credited a different rights holder than every image file in the repo.
 *
 * So the values live in `data/siteConfig.ts` and nothing else spells them out.
 * The scan below is the part that keeps it true: it is easy to add a page and
 * type the brand name into its title, and the page will look perfectly right.
 */

const IDENTITY: Record<string, string> = {
  brand: "Georgian Bay Artists",
  artist: "James Portman",
  domain: "georgianartist.com",
  ownerEmail: "james@portman.ca",
  phone: "416-410-8899",
  ga4: "G-KKZVBB0PWX",
  instagram: "georgian_bay_artist",
};

/** Where these values are allowed to appear as literals. */
const ALLOWED = new Set(["data/siteConfig.ts"]);

/**
 * Comments are documentation, not configuration — a comment naming the live
 * domain is useful, and failing a build over it would only teach people to
 * write vaguer comments.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const FILES = ["app", "components", "lib"]
  .flatMap((d) => sourceFiles(d))
  .filter((f) => !ALLOWED.has(f));

describe("site identity lives in one file", () => {
  it.each(Object.entries(IDENTITY))(
    "no source file hard-codes the %s",
    (_key, value) => {
      const offenders = FILES.filter((f) =>
        stripComments(fs.readFileSync(f, "utf8")).includes(value)
      );
      expect(offenders).toEqual([]);
    }
  );
});

describe("borrowed words live in the config too", () => {
  it("no component hard-codes the collector's name", () => {
    // The testimonial and press strip are the two places the site quotes
    // someone else. Both read from the config so a fork can null them out;
    // a name typed back into a component would render fine and quietly
    // un-fork the page.
    const offenders = FILES.filter((f) =>
      stripComments(fs.readFileSync(f, "utf8")).includes("Greg Fisher")
    );
    expect(offenders).toEqual([]);
  });

  // Deliberately not checking the publication name: app/about/page.tsx names
  // it in the bio prose, which is bespoke copy a fork rewrites wholesale
  // rather than parameterises.
});

describe("the derived values still resolve correctly", () => {
  it("builds the mail From header from the brand and domain", () => {
    // The exact header every transactional send has used.
    expect(mailFrom()).toBe("Georgian Bay Artists <noreply@georgianartist.com>");
  });

  it("strips the www for prose", () => {
    // The site serves on www; "at www.georgianartist.com" reads wrong in a
    // caption, and the Instagram prompt interpolates this.
    expect(bareDomain()).toBe("georgianartist.com");
    expect(new URL(siteConfig.url).hostname).toBe("www.georgianartist.com");
  });

  it("keeps the copyright claim pointed at the same values", () => {
    // lib/copyright.ts reads from the config now. Holder and credit are still
    // different claims — collapsing them is what caused the original drift.
    expect(ARTIST).toBe(siteConfig.artist);
    expect(CREDIT).toBe(siteConfig.brand);
    expect(ARTIST).not.toBe(CREDIT);
    expect(SITE).toBe(siteConfig.url);
    expect(EMAIL).toBe(siteConfig.contact.email);
  });

  it("separates the public address from the inbox that receives notifications", () => {
    // One is printed on the site, the other never is.
    expect(siteConfig.contact.email).not.toBe(siteConfig.contact.ownerEmail);
  });

  it("has a canonical url with no trailing slash", () => {
    // It is concatenated directly with image paths for JSON-LD and OG tags,
    // so a trailing slash produces a double slash in every absolute URL.
    expect(siteConfig.url).toMatch(/^https:\/\//);
    expect(siteConfig.url.endsWith("/")).toBe(false);
  });
});

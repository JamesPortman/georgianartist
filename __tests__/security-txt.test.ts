import { describe, it, expect } from "vitest";
import { securityTxt } from "../lib/security-txt";
import { GET } from "../app/.well-known/security.txt/route";
import { siteConfig } from "../data/siteConfig";

describe("/.well-known/security.txt", () => {
  it("has the fields RFC 9116 requires: Contact and Expires", () => {
    const txt = securityTxt(new Date("2026-09-28T00:00:00Z"));
    expect(txt).toContain(`Contact: mailto:${siteConfig.contact.email}`);
    expect(txt).toMatch(/^Expires: 2027-09-28T00:00:00\.000Z$/m);
    expect(txt).toContain(`Canonical: ${siteConfig.url}/.well-known/security.txt`);
  });

  it("expires within a year, as the RFC recommends", () => {
    const now = new Date();
    const expires = new Date(securityTxt(now).match(/^Expires: (.+)$/m)![1]!);
    const days = (expires.getTime() - now.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(300);
    expect(days).toBeLessThanOrEqual(366);
  });

  it("is served as plain text, with every non-comment line a known field", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    const fields = (await res.text()).split("\n").filter((l) => l && !l.startsWith("#"));
    for (const line of fields) expect(line).toMatch(/^(Contact|Expires|Preferred-Languages|Canonical): \S/);
  });
});

import { describe, it, expect } from "vitest";
import { validateName } from "../lib/name-validation";

describe("validateName", () => {
  it("rejects empty / too-short / non-string names", () => {
    expect(validateName("").ok).toBe(false);
    expect(validateName("a").ok).toBe(false);
    expect(validateName("   ").ok).toBe(false);
    // @ts-expect-error testing bad input
    expect(validateName(null).ok).toBe(false);
  });

  it("accepts legitimate single-word names (mononyms / first-name-only)", () => {
    expect(validateName("Madonna").ok).toBe(true);
    expect(validateName("Ramachandran").ok).toBe(true);
    expect(validateName("Sarah").ok).toBe(true);
  });

  it("accepts normal full names with spaces", () => {
    expect(validateName("John Smith").ok).toBe(true);
    expect(validateName("Maximilian Alexander Wallenstein").ok).toBe(true);
  });

  it("rejects long single-word gibberish (no space, >20 chars)", () => {
    expect(validateName("LaAnWcgtaVtdvNxwaKOgLdF").ok).toBe(false);
    expect(validateName("aaaaaaaaaaaaaaaaaaaaaaaaa").ok).toBe(false);
  });

  it("allows a long name as long as it contains a space", () => {
    expect(validateName("Wolfeschlegelstein Hausenbergerdorff").ok).toBe(true);
  });
});

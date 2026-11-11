import { describe, it, expect } from "vitest";
import { passwordMatches } from "../lib/admin-password";

describe("passwordMatches", () => {
  it("accepts exactly the password", () => {
    expect(passwordMatches("correct horse battery", "correct horse battery")).toBe(true);
  });

  it("refuses anything else, including a prefix or a different case", () => {
    for (const guess of ["correct horse", "correct horse battery ", "Correct horse battery", "x"]) {
      expect(passwordMatches(guess, "correct horse battery")).toBe(false);
    }
  });

  it("never signs in with an empty password, even if ADMIN_PASSWORD is empty or unset", () => {
    expect(passwordMatches("", "")).toBe(false);
    expect(passwordMatches("", undefined)).toBe(false);
    expect(passwordMatches("anything", "")).toBe(false);
    expect(passwordMatches(null, "secret")).toBe(false);
  });
});

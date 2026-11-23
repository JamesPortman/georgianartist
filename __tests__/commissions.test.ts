import { describe, it, expect } from "vitest";
import {
  altOf,
  captionOf,
  COMMISSION_TERMS,
  isCommissionKind,
  isRequestKind,
  parseExampleFields,
  quoteEmailText,
} from "@/lib/commissions";

const form = (values: Record<string, unknown>) => (k: string) => values[k];

describe("captionOf", () => {
  it("joins the parts that are there, subject's name first", () => {
    expect(captionOf({ name: "Bailey", subject: "Golden retriever", medium: "Oil on canvas", size: "12 x 16 in" })).toBe(
      "Bailey, Golden retriever, Oil on canvas, 12 x 16 in"
    );
  });

  it("drops blanks and trims", () => {
    expect(captionOf({ name: " Bailey ", subject: "", medium: null, size: "  8 x 10 in " })).toBe("Bailey, 8 x 10 in");
  });
});

describe("altOf", () => {
  it("describes the painting by its subject", () => {
    expect(altOf({ kind: "pet", name: "Bailey", subject: "Golden Retriever" })).toBe(
      "Commissioned painting of Bailey, golden retriever"
    );
  });

  it("falls back to the kind when there's no subject", () => {
    expect(altOf({ kind: "portrait", name: "Margaret", subject: " " })).toBe("Commissioned painting of Margaret, portrait");
    expect(altOf({ kind: "pet", name: "Rex" })).toBe("Commissioned painting of Rex, pet");
  });
});

describe("kinds", () => {
  it("knows an example is a pet or a portrait, nothing else", () => {
    expect(isCommissionKind("pet")).toBe(true);
    expect(isCommissionKind("portrait")).toBe(true);
    for (const v of ["other", "", "Pet", null, undefined, 1]) expect(isCommissionKind(v)).toBe(false);
  });

  it("takes a request for a pet, a portrait or something else, and nothing inherited", () => {
    for (const v of ["pet", "portrait", "other"]) expect(isRequestKind(v)).toBe(true);
    for (const v of ["boat", "", "toString", "__proto__", "constructor", null, ["pet"]]) expect(isRequestKind(v)).toBe(false);
  });
});

describe("parseExampleFields", () => {
  it("reads and trims the fields, blanks as null", () => {
    expect(parseExampleFields(form({ kind: "pet", name: " Bailey ", subject: "Golden retriever", medium: "", size: "  " }))).toEqual({
      ok: true,
      fields: { kind: "pet", name: "Bailey", subject: "Golden retriever", medium: null, size: null },
    });
  });

  it("requires a kind it knows and a name", () => {
    expect(parseExampleFields(form({ kind: "dog", name: "Bailey" }))).toEqual({ ok: false, error: "Choose Pet or Portrait." });
    expect(parseExampleFields(form({ kind: "pet", name: "   " }))).toEqual({
      ok: false,
      error: "The subject's name is required.",
    });
    expect(parseExampleFields(form({ kind: "pet" }))).toMatchObject({ ok: false });
  });

  it("refuses a field over its limit, by name", () => {
    expect(parseExampleFields(form({ kind: "pet", name: "x".repeat(61) }))).toEqual({
      ok: false,
      error: "The name is too long (60 characters at most).",
    });
    expect(parseExampleFields(form({ kind: "portrait", name: "Ann", size: "x".repeat(61) }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("size"),
    });
    // At the limit is fine.
    expect(parseExampleFields(form({ kind: "pet", name: "x".repeat(60), subject: "y".repeat(100) }))).toMatchObject({ ok: true });
  });

  it("ignores a field that isn't text", () => {
    expect(parseExampleFields(form({ kind: "pet", name: "Bailey", subject: { a: 1 } }))).toEqual({
      ok: true,
      fields: { kind: "pet", name: "Bailey", subject: null, medium: null, size: null },
    });
  });
});

describe("quoteEmailText", () => {
  it("labels every field, and says when one was left out", () => {
    const text = quoteEmailText({ name: "Jane", email: "j@example.com", kind: "other", message: "Our cottage." });
    expect(text).toBe(
      ["Name: Jane", "Email: j@example.com", "For: Something else", "Size in mind: Not given", "Needed by: No deadline given", "", "Our cottage."].join("\n")
    );
    expect(quoteEmailText({ name: "J", email: "e", kind: "pet", size: " 8 x 10 ", deadline: "May", message: "m" })).toContain(
      "Size in mind: 8 x 10\nNeeded by: May"
    );
  });
});

describe("the terms", () => {
  it("are the owner's: half up front, the rest before shipping, four to six weeks", () => {
    expect(COMMISSION_TERMS.deposit).toBe("50% deposit to start, balance before shipping.");
    expect(COMMISSION_TERMS.turnaround).toBe("Typically 4 to 6 weeks.");
  });
});

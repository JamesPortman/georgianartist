import { describe, it, expect } from "vitest";
import {
  formatBookingEmail,
  checkBookingSubmission,
  MIN_SUBMIT_MS,
  type BookingFields,
} from "../lib/booking";

/**
 * The booking form is the scan destination for a printed QR code. A lead lost
 * here is a lead that cannot be recovered — the visitor is standing at a market
 * stall and will not try twice. Every judgement below is biased that way.
 */

const full: BookingFields = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "705-555-0134",
  medium: "Pottery",
  town: "Meaford",
  current: "Instagram or Facebook only",
  notes: "A catalogue of available work,\nand show dates.",
};

describe("formatBookingEmail", () => {
  it("matches the body the handoff specifies, exactly", () => {
    expect(formatBookingEmail(full)).toBe(
      [
        "Name: Ada Lovelace",
        "Email: ada@example.com",
        "Phone: 705-555-0134",
        "What they make: Pottery",
        "Town: Meaford",
        "Where they are now: Instagram or Facebook only",
        "",
        "Notes:",
        "A catalogue of available work,\nand show dates.",
      ].join("\n")
    );
  });

  it("keeps a line for every field even when the optional ones are blank", () => {
    // A consistent shape scans faster than a compact one, and a missing
    // "Phone:" line reads as a bug rather than as a blank answer.
    const sparse = formatBookingEmail({
      ...full,
      phone: "",
      medium: "",
      town: "",
      current: "",
      notes: "",
    });
    for (const label of ["Name:", "Email:", "Phone:", "What they make:", "Town:", "Where they are now:", "Notes:"]) {
      expect(sparse).toContain(label);
    }
    expect(sparse.split("\n")).toHaveLength(9);
  });

  it("preserves the order, so the eye lands in the same place every time", () => {
    const body = formatBookingEmail(full);
    const order = ["Name:", "Email:", "Phone:", "What they make:", "Town:", "Where they are now:", "Notes:"];
    const positions = order.map((l) => body.indexOf(l));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("does not mangle multi-line notes", () => {
    expect(formatBookingEmail(full)).toContain("A catalogue of available work,\nand show dates.");
  });
});

describe("checkBookingSubmission", () => {
  it("passes a normal submission", () => {
    expect(checkBookingSubmission({ website: "", elapsedMs: 30_000 })).toEqual({ ok: true });
  });

  it("catches a filled honeypot", () => {
    expect(checkBookingSubmission({ website: "http://spam.example", elapsedMs: 30_000 })).toEqual({
      ok: false,
      reason: "honeypot",
    });
  });

  it("catches a form completed impossibly fast", () => {
    expect(checkBookingSubmission({ website: "", elapsedMs: 200 })).toEqual({
      ok: false,
      reason: "too-fast",
    });
  });

  it("allows a submission right on the threshold", () => {
    expect(checkBookingSubmission({ website: "", elapsedMs: MIN_SUBMIT_MS })).toEqual({ ok: true });
  });

  describe("never rejects a real person over a missing signal", () => {
    it.each([
      ["no elapsedMs at all", { website: "" }],
      ["a non-numeric elapsedMs", { website: "", elapsedMs: "fast" }],
      ["NaN", { website: "", elapsedMs: NaN }],
      ["a negative clock", { website: "", elapsedMs: -5 }],
      ["no honeypot field", { elapsedMs: 30_000 }],
      ["a whitespace-only honeypot", { website: "   ", elapsedMs: 30_000 }],
    ])("passes with %s", (_label, input) => {
      // A blocked timer, a restored tab or an odd browser can all lose this.
      // Refusing the enquiry would trade a real lead for nothing.
      expect(checkBookingSubmission(input).ok).toBe(true);
    });
  });

  it("gives a human long enough to actually type", () => {
    // Generous on purpose: being wrong costs an enquiry, not an inbox.
    expect(MIN_SUBMIT_MS).toBeGreaterThanOrEqual(1_000);
    expect(MIN_SUBMIT_MS).toBeLessThanOrEqual(5_000);
  });
});

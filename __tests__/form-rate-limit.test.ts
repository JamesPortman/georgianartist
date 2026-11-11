import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/client-ip", () => ({ clientIp: async () => "203.0.113.7" }));

const { limitKey, LIMITS } = await import("../lib/form-rate-limit");

/**
 * The limiter's keys are what the FormRateLimit table stores. The site says it
 * keeps no visitor IP addresses, and an email address is no better, so a key
 * must never contain the value it was made from.
 */
describe("limitKey", () => {
  it("never contains the raw IP or email address", () => {
    expect(limitKey("ip:buy", "203.0.113.7")).not.toContain("203.0.113.7");
    expect(limitKey("to", "jane@example.com")).not.toContain("jane");
  });

  it("is stable, so repeat submissions count against the same row", () => {
    expect(limitKey("to", "jane@example.com")).toBe(limitKey("to", "jane@example.com"));
  });

  it("treats an address the same whatever its case or padding", () => {
    // Otherwise "Victim@Example.com " is a fresh quota for the same inbox.
    expect(limitKey("to", " Victim@Example.com ")).toBe(limitKey("to", "victim@example.com"));
  });

  it("keeps each scope separate", () => {
    expect(limitKey("ip:buy", "203.0.113.7")).not.toBe(limitKey("ip:contact", "203.0.113.7"));
  });
});

describe("LIMITS", () => {
  it("lets a real customer through: at least two submissions, and a confirmation", () => {
    expect(LIMITS.perIp.max).toBeGreaterThanOrEqual(2);
    expect(LIMITS.perRecipient.max).toBeGreaterThanOrEqual(1);
  });
});

describe("mailbox", () => {
  it("counts +tag variants of one address as one inbox", async () => {
    const { mailbox } = await import("../lib/form-rate-limit");
    expect(mailbox("Jane+1@Example.com")).toBe("jane@example.com");
    expect(mailbox("jane+anything@example.com")).toBe(mailbox("jane@example.com"));
  });

  it("ignores dots at Gmail only, and treats googlemail as gmail", async () => {
    const { mailbox } = await import("../lib/form-rate-limit");
    expect(mailbox("j.a.n.e+2@googlemail.com")).toBe("jane@gmail.com");
    expect(mailbox("j.ane@example.com")).toBe("j.ane@example.com");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DNS MX lookup so tests don't hit the network.
const resolveMx = vi.fn();
vi.mock("dns", () => {
  const promises = { resolveMx: (...args: unknown[]) => resolveMx(...args) };
  return { promises, default: { promises } };
});

import { validateEmail } from "../lib/email-validation";

beforeEach(() => {
  resolveMx.mockReset();
  // Default: domain has a valid MX record.
  resolveMx.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }]);
});

describe("validateEmail", () => {
  it("rejects missing or malformed addresses (no MX lookup needed)", async () => {
    expect((await validateEmail("")).ok).toBe(false);
    expect((await validateEmail("not-an-email")).ok).toBe(false);
    expect((await validateEmail("missing@domain")).ok).toBe(false);
    expect((await validateEmail("@nodomain.com")).ok).toBe(false);
  });

  it("rejects disposable domains", async () => {
    const r = await validateEmail("spammer@mailinator.com");
    expect(r.ok).toBe(false);
  });

  it("rejects Gmail dot-abuse (4+ dots in the local part)", async () => {
    expect((await validateEmail("a.b.c.d.e@gmail.com")).ok).toBe(false);
    // 2 dots is a normal human pattern → allowed
    expect((await validateEmail("john.smith.jr@gmail.com")).ok).toBe(true);
  });

  it("accepts a well-formed address with a valid MX record", async () => {
    const r = await validateEmail("hello@example.com");
    expect(r.ok).toBe(true);
  });

  it("rejects when the domain has no MX records", async () => {
    resolveMx.mockResolvedValueOnce([]);
    expect((await validateEmail("hi@no-mail-here.com")).ok).toBe(false);
  });

  it("rejects when the MX lookup throws (nonexistent domain)", async () => {
    resolveMx.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect((await validateEmail("hi@nonexistent-domain-xyz.com")).ok).toBe(false);
  });
});

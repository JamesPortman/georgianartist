import { describe, it, expect, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const { rateLimitAddress } = await import("../lib/client-ip");

describe("rateLimitAddress", () => {
  it("keeps an IPv4 address as is", () => {
    expect(rateLimitAddress("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitAddress("unknown")).toBe("unknown");
  });

  it("counts every address in one IPv6 /64 as one client", () => {
    const a = rateLimitAddress("2001:db8:85a3:42:1:2:3:4");
    const b = rateLimitAddress("2001:0db8:85a3:0042:ffff:ffff:ffff:ffff");
    expect(a).toBe("2001:db8:85a3:42::/64");
    expect(b).toBe(a);
  });

  it("expands :: before cutting, wherever it sits", () => {
    expect(rateLimitAddress("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateLimitAddress("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitAddress("2001:db8:1:2::")).toBe("2001:db8:1:2::/64");
    expect(rateLimitAddress("2001:DB8:1:2:a::b")).toBe("2001:db8:1:2::/64");
  });

  it("tells different /64s apart", () => {
    expect(rateLimitAddress("2001:db8:0:1::5")).not.toBe(rateLimitAddress("2001:db8:0:2::5"));
  });

  it("treats an IPv4-mapped address as the IPv4 address", () => {
    expect(rateLimitAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("leaves anything it can't parse alone rather than merging it with others", () => {
    expect(rateLimitAddress("not:an:address")).toBe("not:an:address");
  });
});

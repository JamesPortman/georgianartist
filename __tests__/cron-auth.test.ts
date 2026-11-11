import { describe, it, expect } from "vitest";
import { isCronRequest } from "../lib/cron-auth";

const req = (authorization?: string) =>
  new Request("http://localhost/api/cron/x", authorization ? { headers: { authorization } } : {});

describe("isCronRequest", () => {
  it("accepts exactly the bearer secret", () => {
    expect(isCronRequest(req("Bearer s3cret"), "s3cret")).toBe(true);
  });

  it("refuses a wrong, partial or missing header", () => {
    for (const h of ["Bearer wrong", "s3cret", "Bearer s3cret2", "bearer s3cret", undefined]) {
      expect(isCronRequest(req(h), "s3cret")).toBe(false);
    }
  });

  it("refuses everything when CRON_SECRET is unset, rather than letting anyone in", () => {
    expect(isCronRequest(req("Bearer "), "")).toBe(false);
    expect(isCronRequest(req("Bearer undefined"), undefined)).toBe(false);
    expect(isCronRequest(req(), undefined)).toBe(false);
  });
});

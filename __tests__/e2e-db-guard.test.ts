import { describe, it, expect } from "vitest";
import {
  databaseHost,
  isThrowawayDatabase,
  assertThrowawayDatabase,
  throwawayDatabaseMessage,
  OVERRIDE_ENV,
} from "../e2e/db-guard";

/**
 * The guard that stops `npm run test:e2e` editing the live catalogue.
 *
 * Covered here rather than left to the E2E run itself, because the thing it
 * protects against is the E2E run: a guard that only fails in the situation it
 * exists to prevent gets its first real exercise on production.
 */

const CI_URL = "postgresql://postgres:postgres@localhost:5432/test";
const PROD_URL =
  "postgresql://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/neondb?sslmode=require";

describe("databaseHost", () => {
  it("reads the host out of a connection string", () => {
    expect(databaseHost(CI_URL)).toBe("localhost");
    expect(databaseHost(PROD_URL)).toBe("ep-cool-name-123.us-east-2.aws.neon.tech");
  });

  it("unwraps a bracketed IPv6 literal", () => {
    // WHATWG URL hands back "[::1]"; the allowlist stores it bare.
    expect(databaseHost("postgresql://u:p@[::1]:5432/test")).toBe("::1");
  });

  it("returns null rather than throwing on nonsense", () => {
    expect(databaseHost("not a url")).toBeNull();
    expect(databaseHost("")).toBeNull();
  });
});

describe("isThrowawayDatabase", () => {
  it("accepts the local hosts CI and a laptop container use", () => {
    for (const url of [
      CI_URL,
      "postgres://u:p@127.0.0.1:5432/test",
      "postgresql://u:p@[::1]:5432/test",
      "postgresql://u:p@0.0.0.0:5432/test",
    ]) {
      expect(isThrowawayDatabase(url)).toBe(true);
    }
  });

  it("rejects production", () => {
    expect(isThrowawayDatabase(PROD_URL)).toBe(false);
  });

  it("fails closed on anything it cannot vouch for", () => {
    // An allowlist, not a denylist: a managed provider nobody has thought of
    // yet must be refused, not waved through for lacking a known-bad name.
    expect(isThrowawayDatabase("postgresql://u:p@db.somewhere-new.io:5432/app")).toBe(false);
    expect(isThrowawayDatabase("postgresql://u:p@10.0.0.5:5432/app")).toBe(false);
    expect(isThrowawayDatabase(undefined)).toBe(false);
    expect(isThrowawayDatabase("")).toBe(false);
    expect(isThrowawayDatabase("not a url")).toBe(false);
  });

  it("is not fooled by a production host that merely mentions localhost", () => {
    expect(isThrowawayDatabase("postgresql://u:p@localhost.evil.example/app")).toBe(false);
    expect(isThrowawayDatabase("postgresql://u:p@neon.tech/db?host=localhost")).toBe(false);
  });
});

describe("assertThrowawayDatabase", () => {
  it("passes for a throwaway database", () => {
    expect(() => assertThrowawayDatabase(CI_URL, undefined)).not.toThrow();
  });

  it("throws for production", () => {
    expect(() => assertThrowawayDatabase(PROD_URL, undefined)).toThrow(/refused to start/);
  });

  it("throws when DATABASE_URL is unset", () => {
    expect(() => assertThrowawayDatabase(undefined, undefined)).toThrow(/refused to start/);
  });

  it("reads nothing from the environment", () => {
    // This used to default its arguments to process.env, so an explicit
    // `undefined` fired the default and the test above asserted whatever the
    // runner happened to have. It passed on a laptop with no DATABASE_URL and
    // failed in CI, where it is set to the local test database — backwards for
    // a guard whose entire job is being right about the environment.
    const prevUrl = process.env.DATABASE_URL;
    const prevOverride = process.env[OVERRIDE_ENV];
    process.env.DATABASE_URL = CI_URL;
    process.env[OVERRIDE_ENV] = "1";
    try {
      expect(() => assertThrowawayDatabase(undefined, undefined)).toThrow(/refused to start/);
      expect(() => assertThrowawayDatabase(PROD_URL, undefined)).toThrow(/refused to start/);
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevUrl;
      if (prevOverride === undefined) delete process.env[OVERRIDE_ENV];
      else process.env[OVERRIDE_ENV] = prevOverride;
    }
  });

  it("lets an explicit override through", () => {
    expect(() => assertThrowawayDatabase(PROD_URL, "1")).not.toThrow();
  });

  it("does not treat any other override value as consent", () => {
    for (const v of ["0", "true", "yes", ""]) {
      expect(() => assertThrowawayDatabase(PROD_URL, v)).toThrow(/refused to start/);
    }
  });
});

describe("the refusal message", () => {
  it("names the host, the damage, and the way out", () => {
    const msg = throwawayDatabaseMessage(PROD_URL);
    expect(msg).toContain("ep-cool-name-123.us-east-2.aws.neon.tech");
    expect(msg).toContain("docker run");
    expect(msg).toContain("npm run db:seed");
    expect(msg).toContain(OVERRIDE_ENV);
  });

  it("says so plainly when DATABASE_URL is simply missing", () => {
    expect(throwawayDatabaseMessage(undefined)).toContain("unset");
  });
});

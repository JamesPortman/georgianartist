import { describe, it, expect } from "vitest";
import { databaseRefusal, assertDatabaseAllowed, ALLOW_HOST_ENV } from "../lib/db-guard";

/**
 * The guard in the Prisma singleton that keeps a laptop off the production
 * database unless that host is named. Each case passes its env explicitly, so
 * the runner's own environment can't decide the result.
 */

const PROD = "postgresql://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
const PROD_HOST = "ep-cool-name-123.us-east-2.aws.neon.tech";
const DEV = "postgresql://u:p@ep-dev-branch-456.us-east-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://postgres:postgres@localhost:5432/test";

describe("databaseRefusal", () => {
  it("refuses a remote database off Vercel when nothing names it", () => {
    const why = databaseRefusal({ DATABASE_URL: PROD });
    expect(why).toContain(PROD_HOST);
    expect(why).toContain(ALLOW_HOST_ENV);
  });

  it("allows anything on Vercel, where each environment sets its own database", () => {
    expect(databaseRefusal({ DATABASE_URL: PROD, VERCEL: "1" }, "app")).toBeNull();
    expect(databaseRefusal({ DATABASE_URL: PROD, VERCEL: "1", CI: "1" }, "build")).toBeNull();
  });

  it("allows a local database, as in CI and E2E", () => {
    expect(databaseRefusal({ DATABASE_URL: LOCAL })).toBeNull();
    expect(databaseRefusal({ DATABASE_URL: "postgresql://u:p@127.0.0.1/db" })).toBeNull();
  });

  it("allows no URL at all, since there is nothing to reach", () => {
    expect(databaseRefusal({})).toBeNull();
  });

  it("allows exactly the named host, and only that one", () => {
    const devHost = "ep-dev-branch-456.us-east-2.aws.neon.tech";
    expect(databaseRefusal({ DATABASE_URL: DEV, DATABASE_ALLOW_HOST: devHost })).toBeNull();
    expect(databaseRefusal({ DATABASE_URL: PROD, DATABASE_ALLOW_HOST: devHost })).not.toBeNull();
  });

  it("allows production when it is named on purpose", () => {
    expect(databaseRefusal({ DATABASE_URL: PROD, DATABASE_ALLOW_HOST: ` ${PROD_HOST.toUpperCase()} ` })).toBeNull();
  });

  it("does not let a host prefix or suffix pass as a match", () => {
    expect(databaseRefusal({ DATABASE_URL: PROD, DATABASE_ALLOW_HOST: "neon.tech" })).not.toBeNull();
    expect(databaseRefusal({ DATABASE_URL: PROD, DATABASE_ALLOW_HOST: "ep-cool-name-123" })).not.toBeNull();
  });

  it("fails closed on a URL it can't read", () => {
    expect(databaseRefusal({ DATABASE_URL: "not a url", DATABASE_ALLOW_HOST: "not a url" })).not.toBeNull();
  });
});

describe("assertDatabaseAllowed", () => {
  it("throws on a refusal and is silent otherwise", () => {
    expect(() => assertDatabaseAllowed({ DATABASE_URL: PROD })).toThrow(/Refusing to connect/);
    expect(() => assertDatabaseAllowed({ DATABASE_URL: LOCAL })).not.toThrow();
  });
});

describe("scripts", () => {
  it("every script (scripts/, prisma/) that builds its own Prisma client checks the guard first", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.(ts|mjs|js)$/.test(e.name) ? [p] : [];
      });
    // prisma/ too: the seed builds its own client, and lived there unguarded until October 2026.
    const dirs = ["scripts", "prisma"].map((d) => path.join(__dirname, "..", d));
    const offenders = dirs.flatMap(walk).filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      const client = src.indexOf("new PrismaClient(");
      if (client === -1) return false;
      const guard = src.indexOf("assertDatabaseAllowed(");
      return guard === -1 || guard > client;
    });
    expect(offenders).toEqual([]);
  });
});

describe("build scripts", () => {
  it("every guarded script the build runs says so, or Vercel's build would be refused", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(__dirname, "..");
    const build: string = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts.build;
    const scripts = [...build.matchAll(/tsx (scripts\/\S+\.ts)/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    const offenders = scripts.filter((f) => {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      const guarded = /assertDatabaseAllowed\(|databaseRefusal\(/.test(src);
      return guarded && !/(assertDatabaseAllowed|databaseRefusal)\(process\.env, "build"\)/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

describe("preview deployments", () => {
  const BRANCH = "postgresql://u:p@ep-preview-branch-789-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
  const preview = (over: Record<string, string> = {}) => ({ VERCEL: "1", VERCEL_ENV: "preview", ...over });
  const refusal = (env: Record<string, string>) => databaseRefusal(env, "app");

  it("refuse any database until production's host is named, so they can't guess", () => {
    expect(refusal(preview({ DATABASE_URL: BRANCH }))).toMatch(/PRODUCTION_DATABASE_HOST is not set/);
  });

  it("refuse production, pooled or not: the case Neon preview branching exists to prevent", () => {
    const prodPooled = PROD.replace("ep-cool-name-123", "ep-cool-name-123-pooler");
    expect(refusal(preview({ DATABASE_URL: PROD, PRODUCTION_DATABASE_HOST: PROD_HOST }))).toMatch(/is production/);
    expect(refusal(preview({ DATABASE_URL: prodPooled, PRODUCTION_DATABASE_HOST: PROD_HOST }))).toMatch(/is production/);
  });

  it("allow their own Neon branch", () => {
    expect(refusal(preview({ DATABASE_URL: BRANCH, PRODUCTION_DATABASE_HOST: PROD_HOST }))).toBeNull();
  });

  it("leave production deployments alone", () => {
    expect(refusal({ VERCEL: "1", VERCEL_ENV: "production", DATABASE_URL: PROD })).toBeNull();
  });
});

describe("a pulled Vercel env file is not a deployment", () => {
  // What `vercel env pull --environment=production` writes, minus the secrets.
  const pulled = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_TARGET_ENV: "production", DATABASE_URL: PROD };

  it("a script refuses it: scripts never run on Vercel, so VERCEL is ignored", () => {
    expect(databaseRefusal(pulled)).toMatch(/Refusing to connect/);
    expect(databaseRefusal(pulled, "script")).toMatch(/Refusing to connect/);
    expect(() => assertDatabaseAllowed(pulled)).toThrow(/Refusing to connect/);
  });

  it("a script still accepts the host named on purpose", () => {
    expect(databaseRefusal({ ...pulled, DATABASE_ALLOW_HOST: PROD_HOST })).toBeNull();
  });

  it("the build check refuses it without Vercel's CI=1", () => {
    expect(databaseRefusal(pulled, "build")).toMatch(/Refusing to connect/);
    expect(databaseRefusal({ ...pulled, CI: "true" }, "build")).toMatch(/Refusing to connect/);
    expect(databaseRefusal({ ...pulled, CI: "1" }, "build")).toBeNull();
  });

  it("the build check still applies the preview rule on Vercel", () => {
    const env = { ...pulled, VERCEL_ENV: "preview", CI: "1" };
    expect(databaseRefusal(env, "build")).toMatch(/PRODUCTION_DATABASE_HOST is not set/);
  });

  it("the dev server refuses it: no deployment runs NODE_ENV=development", () => {
    expect(databaseRefusal({ ...pulled, NODE_ENV: "development" }, "app")).toMatch(/Refusing to connect/);
    expect(databaseRefusal({ ...pulled, NODE_ENV: "production" }, "app")).toBeNull();
  });

  it("without VERCEL, no context trusts a remote database", () => {
    for (const where of ["script", "build", "app"] as const) {
      expect(databaseRefusal({ DATABASE_URL: PROD, CI: "1" }, where)).not.toBeNull();
    }
  });
});

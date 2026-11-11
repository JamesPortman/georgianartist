import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Server errors email the owner once a day per kind, never once per request —
 * a page that fails a thousand times in an hour is one email, and one that is
 * still failing tomorrow is a second.
 */

const db = vi.hoisted(() => ({ alerted: true, fail: false, calls: 0, values: [] as unknown[], released: [] as unknown[] }));
const alerts = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      db.calls++;
      db.values = values;
      if (db.fail) throw new Error("connection refused");
      return [{ alerted: db.alerted }];
    },
    $executeRaw: async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      db.released.push(...values);
      return 1;
    },
  },
}));
vi.mock("@/lib/notify", () => ({
  sendAlert: async (subject: string) => {
    alerts.push(subject);
  },
}));

const { reportError, errorDigest, errorMessage, errorStack, STACK_MAX_CHARS } = await import(
  "../lib/error-report"
);

beforeEach(() => {
  db.alerted = true;
  db.fail = false;
  db.calls = 0;
  db.values = [];
  db.released = [];
  alerts.length = 0;
});

describe("errorDigest", () => {
  it("uses Next's digest when there is one, so a React-wrapped error keeps its identity", () => {
    const err = Object.assign(new Error("Server Components render"), { digest: "4059286729" });
    expect(errorDigest(err)).toBe("4059286729");
  });

  it("hashes the message otherwise, and never returns the raw message", () => {
    const d = errorDigest(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    expect(d).toMatch(/^[0-9a-f]{16}$/);
    expect(errorDigest(new Error("connect ECONNREFUSED 10.0.0.1:5432"))).toBe(d);
  });

  it("caps the stored message", () => {
    expect(errorMessage(new Error("x".repeat(5000))).length).toBeLessThanOrEqual(500);
  });
});

describe("errorStack", () => {
  it("keeps the top of the stack, capped", () => {
    const err = new Error("boom");
    err.stack = `Error: boom\n${"    at frame (file.ts:1:1)\n".repeat(500)}`;
    const s = errorStack(err);
    expect(s?.startsWith("Error: boom\n    at frame")).toBe(true);
    expect(s!.length).toBe(STACK_MAX_CHARS);
  });

  it("is null for a thrown value with no stack", () => {
    expect(errorStack("a string")).toBeNull();
    expect(errorStack({ message: "not an Error" })).toBeNull();
  });
});

describe("reportError", () => {
  it("stores the stack fragment with the row", async () => {
    const err = new Error("boom");
    await reportError(err, { path: "/", kind: "route" });
    expect(db.values).toContain(errorStack(err));
  });

  it("emails when the row says this call claimed the alert", async () => {
    await reportError(new Error("boom"), { path: "/products/lora-bay", kind: "render (page)" });
    expect(alerts).toEqual(["Error on /products/lora-bay"]);
  });

  it("stays quiet on a repeat within the day", async () => {
    db.alerted = false;
    await reportError(new Error("boom"), { path: "/", kind: "render (page)" });
    expect(db.calls).toBe(1);
    expect(alerts).toEqual([]);
  });

  it("lets the caller veto the email, but still records the error", async () => {
    const mayAlert = vi.fn(async () => false);
    await reportError(new Error("boom"), { path: "/", kind: "browser (event)" }, mayAlert);
    expect(db.calls).toBe(1);
    expect(mayAlert).toHaveBeenCalledOnce();
    expect(alerts).toEqual([]);
  });

  it("gives back a vetoed claim, so the kind can still alert once the cap allows", async () => {
    const err = new Error("boom");
    await reportError(err, { path: "/", kind: "browser (event)" }, async () => false);
    expect(db.released).toEqual([errorDigest(err)]);
  });

  it("keeps the claim when the email goes out", async () => {
    await reportError(new Error("boom"), { path: "/", kind: "server" });
    expect(db.released).toEqual([]);
    expect(alerts).toHaveLength(1);
  });

  it("asks the veto only when this call claimed the alert", async () => {
    db.alerted = false;
    const mayAlert = vi.fn(async () => true);
    await reportError(new Error("boom"), { path: "/", kind: "browser (event)" }, mayAlert);
    expect(mayAlert).not.toHaveBeenCalled();
  });

  it("never throws, even with the database down", async () => {
    db.fail = true;
    await expect(reportError(new Error("boom"), { path: "/", kind: "route" })).resolves.toBeUndefined();
    expect(alerts).toEqual([]);
  });
});

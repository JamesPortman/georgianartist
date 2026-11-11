import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The daily limit on enquiries emailed to the owner (lib/form-rate-limit.ts).
 * The fake database returns whatever count the test sets.
 */

const db = vi.hoisted(() => ({ count: 1, fail: false, keys: [] as unknown[] }));
const sendAlert = vi.hoisted(() => vi.fn(async (_subject: string, _text: string) => {}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: async (_sql: TemplateStringsArray, key: unknown) => {
      db.keys.push(key);
      if (db.fail) throw new Error("database unreachable");
      return [{ count: db.count }];
    },
  },
}));
vi.mock("@/lib/client-ip", () => ({ clientIp: async () => "203.0.113.7" }));
vi.mock("@/lib/notify", () => ({ sendAlert }));

const { allowOwnerEmail, LIMITS } = await import("../lib/form-rate-limit");
const MAX = LIMITS.ownerDaily.max;

beforeEach(() => {
  db.count = 1;
  db.fail = false;
  db.keys = [];
  sendAlert.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("allowOwnerEmail", () => {
  it("counts every form against one shared daily total", async () => {
    await allowOwnerEmail("contact");
    await allowOwnerEmail("buy");
    expect(db.keys).toEqual(["global:owner", "global:owner"]);
    expect(LIMITS.ownerDaily).toEqual({ max: 150, windowSec: 24 * 60 * 60 });
  });

  it("allows up to the limit, then refuses", async () => {
    db.count = MAX;
    expect(await allowOwnerEmail("contact")).toBe(true);
    db.count = MAX + 1;
    expect(await allowOwnerEmail("contact")).toBe(false);
  });

  it("alerts the owner once, on the first enquiry over the limit", async () => {
    db.count = MAX;
    await allowOwnerEmail("contact");
    expect(sendAlert).not.toHaveBeenCalled();
    db.count = MAX + 1;
    await allowOwnerEmail("book");
    expect(sendAlert).toHaveBeenCalledOnce();
    expect(sendAlert.mock.calls[0]![0]).toMatch(/Form limit reached/);
    db.count = MAX + 2;
    await allowOwnerEmail("buy");
    expect(sendAlert).toHaveBeenCalledOnce();
  });

  it("lets the enquiry through when the database can't be reached", async () => {
    db.fail = true;
    expect(await allowOwnerEmail("contact")).toBe(true);
  });
});

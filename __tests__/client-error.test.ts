import { describe, it, expect, vi, beforeEach } from "vitest";

const hit = vi.fn();
const reportError = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/client-ip", () => ({ clientIp: async () => "203.0.113.7" }));
vi.mock("@/lib/form-rate-limit", () => ({ hit: (...a: unknown[]) => hit(...a), limitKey: (s: string) => `${s}:k` }));
vi.mock("@/lib/error-report", () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { parseClientError, toError } = await import("../lib/client-error");
const { POST, PER_IP, ALERTS_PER_DAY } = await import("../app/api/client-error/route");

const good = { name: "TypeError", message: "x is undefined", stack: "at a (/_next/static/x.js:1:2)", path: "/gift-shop", kind: "browser (event)" };
const body = (o: object) => JSON.stringify(o);

/**
 * Errors thrown in visitors' browsers, which the server never sees. The
 * endpoint is open to anyone, so the parser keeps only a bounded report about
 * one of this site's pages, and the route limits how often one address can
 * write and how often these reports can email the owner.
 */
describe("parseClientError", () => {
  it("keeps a well-formed report", () => {
    expect(parseClientError(body(good))).toEqual(good);
  });

  it("drops the query string from the path, which can carry anything", () => {
    expect(parseClientError(body({ ...good, path: "/search?q=jane@example.com#x" }))?.path).toBe("/search");
  });

  it("refuses a path that isn't one of this site's", () => {
    for (const path of ["https://evil.example/", "//evil.example/x", "gift-shop", ""]) {
      expect(parseClientError(body({ ...good, path }))).toBeNull();
    }
  });

  it("refuses an unknown kind, so a report can't pose as a server error", () => {
    expect(parseClientError(body({ ...good, kind: "render (page)" }))).toBeNull();
  });

  it("drops the noise every site sees", () => {
    expect(parseClientError(body({ ...good, message: "Script error." }))).toBeNull();
    expect(parseClientError(body({ ...good, message: "ResizeObserver loop completed with undelivered notifications." }))).toBeNull();
  });

  it("refuses an empty message, a body that isn't an object, and an oversized body", () => {
    expect(parseClientError(body({ ...good, message: " " }))).toBeNull();
    expect(parseClientError("not json")).toBeNull();
    expect(parseClientError("[1]")).toBeNull();
    expect(parseClientError("null")).toBeNull();
    expect(parseClientError(body({ ...good, stack: "x".repeat(9_000) }))).toBeNull();
  });

  it("caps each field", () => {
    const r = parseClientError(body({ ...good, name: "N".repeat(200), message: "m".repeat(600), stack: "s".repeat(3000), path: "/" + "p".repeat(300) }));
    expect(r?.name).toHaveLength(80);
    expect(r?.message).toHaveLength(500);
    expect(r?.stack).toHaveLength(2000);
    expect(r?.path).toHaveLength(200);
  });

  it("defaults a missing name, and stores no stack when none was sent", () => {
    const r = parseClientError(body({ message: "boom", path: "/", kind: "browser (page)" }));
    expect(r).toEqual({ name: "Error", message: "boom", stack: null, path: "/", kind: "browser (page)" });
  });

  it("becomes an Error carrying the browser's name, message and stack", () => {
    const e = toError(good);
    expect([e.name, e.message, e.stack]).toEqual([good.name, good.message, good.stack]);
  });
});

describe("POST /api/client-error", () => {
  const post = (b: string, ua = "Mozilla/5.0 (Macintosh) Safari/605") =>
    POST(new Request("http://localhost/api/client-error", { method: "POST", body: b, headers: { "user-agent": ua } }));

  beforeEach(() => {
    hit.mockReset().mockResolvedValue(true);
    reportError.mockReset().mockResolvedValue(undefined);
  });

  it("records a report under its page and kind, and always answers 204", async () => {
    const res = await post(body(good));
    expect(res.status).toBe(204);
    expect(reportError).toHaveBeenCalledOnce();
    const [err, ctx] = reportError.mock.calls[0]!;
    expect((err as Error).message).toBe(good.message);
    expect(ctx).toEqual({ path: "/gift-shop", kind: "browser (event)" });
    expect(hit).toHaveBeenCalledWith("ip:client-error:k", PER_IP);
  });

  it("caps the emails these reports can send, in total, per day", async () => {
    await post(body(good));
    const mayAlert = reportError.mock.calls[0]![2] as () => Promise<boolean>;
    hit.mockClear().mockResolvedValueOnce(false);
    expect(await mayAlert()).toBe(false);
    expect(hit).toHaveBeenCalledWith("all:client-error-alert", ALERTS_PER_DAY);
    hit.mockRejectedValueOnce(new Error("db down"));
    expect(await mayAlert()).toBe(false);
  });

  it("records nothing over the per-address limit, or when the limiter is down", async () => {
    hit.mockResolvedValueOnce(false);
    expect((await post(body(good))).status).toBe(204);
    hit.mockRejectedValueOnce(new Error("db down"));
    expect((await post(body(good))).status).toBe(204);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("ignores bots and malformed reports without touching the limiter", async () => {
    expect((await post(body(good), "Mozilla/5.0 HeadlessChrome/140")).status).toBe(204);
    expect((await post("garbage")).status).toBe(204);
    expect(hit).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("still answers 204 if recording throws", async () => {
    reportError.mockRejectedValueOnce(new Error("db down"));
    expect((await post(body(good))).status).toBe(204);
  });

  it("keeps per-address and daily limits tight enough to bound the inbox", () => {
    expect(PER_IP.max).toBeLessThanOrEqual(20);
    expect(ALERTS_PER_DAY).toEqual({ max: 10, windowSec: 86_400 });
  });
});

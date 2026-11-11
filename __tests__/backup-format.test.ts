import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { buildSnapshot, fingerprint, restoreSnapshot, SNAPSHOT_VERSION, TABLES, type Snapshot } from "../lib/backup";

/**
 * The restore drill (scripts/backup-drill.ts) passes only when the restored
 * database reads back with the same fingerprint as the snapshot. So the
 * fingerprint has to be blind to what doesn't matter (row and key order) and
 * see everything that does.
 */

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  version: 2,
  exportedAt: "2026-10-01T05:00:00.000Z",
  count: 2,
  products: [
    { id: "lora-bay", title: "Lora Bay", price: 119, updatedAt: "2026-09-01T00:00:00.000Z" },
    { id: "council-beach", title: "Council Beach", price: 99, updatedAt: "2026-09-02T00:00:00.000Z" },
  ],
  makingOf: [],
  instagramPosts: [],
  excludedVisitors: [],
  productSlugs: [],
  ...over,
});

describe("fingerprint", () => {
  it("ignores row order and key order", () => {
    const a = snap();
    const b = snap({ products: [{ price: 99, title: "Council Beach", id: "council-beach", updatedAt: "2026-09-02T00:00:00.000Z" }, a.products[0]!] });
    expect(fingerprint(b)).toEqual(fingerprint(a));
  });

  it("sees a changed value, a missing row and a date that moved", () => {
    const base = fingerprint(snap()).products;
    expect(fingerprint(snap({ products: [{ ...snap().products[0]!, price: 120 }, snap().products[1]!] })).products).not.toEqual(base);
    expect(fingerprint(snap({ products: [snap().products[0]!] })).products.rows).toBe(1);
    expect(
      fingerprint(snap({ products: [{ ...snap().products[0]!, updatedAt: "2026-09-01T00:00:00.001Z" }, snap().products[1]!] })).products
    ).not.toEqual(base);
  });

  it("is a hex SHA-256 of the canonical rows, one per line", () => {
    const one = snap({ products: [{ b: 2, a: 1 }] });
    expect(fingerprint(one).products).toEqual({
      rows: 1,
      sha256: createHash("sha256").update('{"a":1,"b":2}').digest("hex"),
    });
    const two = snap({ products: [{ a: 1 }, { a: 2 }] });
    expect(fingerprint(two).products.sha256).toBe(
      createHash("sha256").update('{"a":1}\n{"a":2}').digest("hex")
    );
  });

  it("canonicalises nested objects and arrays too", () => {
    const a = snap({ instagramPosts: [{ id: "p", meta: { y: 1, x: [{ q: 1, p: 2 }] } }] });
    const b = snap({ instagramPosts: [{ meta: { x: [{ p: 2, q: 1 }], y: 1 }, id: "p" }] });
    expect(fingerprint(b).instagramPosts).toEqual(fingerprint(a).instagramPosts);
  });

  it("treats a version 1 snapshot, which had no productSlugs, as having none", () => {
    const v1 = snap();
    delete v1.productSlugs;
    delete v1.version;
    expect(fingerprint(v1).productSlugs).toEqual(fingerprint(snap()).productSlugs);
  });
});

describe("restoreSnapshot", () => {
  it("inserts every table with one statement each, and skips empty ones", async () => {
    const calls: string[] = [];
    const table = (name: string) => ({
      createMany: async ({ data }: { data: unknown[] }) => {
        calls.push(name);
        return { count: data.length };
      },
    });
    const prisma = {
      product: table("product"),
      makingOf: table("makingOf"),
      instagramPost: table("instagramPost"),
      excludedVisitor: table("excludedVisitor"),
      productSlug: table("productSlug"),
    };
    const counts = await restoreSnapshot(prisma as never, snap({ productSlugs: [{ slug: "old", productId: "lora-bay" }] }));
    expect(counts).toEqual({ products: 2, makingOf: 0, instagramPosts: 0, excludedVisitors: 0, productSlugs: 1 });
    expect(calls).toEqual(["product", "productSlug"]);
  });
});

describe("restoreSnapshot, every table", () => {
  it("hands each table its own rows, as they round-trip through JSON", async () => {
    const received: Record<string, unknown> = {};
    const table = (name: string) => ({
      createMany: async ({ data }: { data: unknown[] }) => {
        received[name] = data;
        return { count: data.length };
      },
    });
    const prisma = {
      product: table("product"),
      makingOf: table("makingOf"),
      instagramPost: table("instagramPost"),
      excludedVisitor: table("excludedVisitor"),
      productSlug: table("productSlug"),
    };
    const at = new Date("2026-10-01T05:00:00.000Z");
    const full = snap({
      makingOf: [{ id: "m1", productId: "lora-bay", sortOrder: 0 }],
      instagramPosts: [
        { id: "p1", caption: "Lora Bay at dusk", createdAt: at },
        { id: "p2", caption: "Council Beach", createdAt: at },
      ],
      excludedVisitors: [{ id: "v1" }],
      productSlugs: [{ slug: "old", productId: "lora-bay" }],
    });
    const counts = await restoreSnapshot(prisma as never, full);
    expect(counts).toEqual({ products: 2, makingOf: 1, instagramPosts: 2, excludedVisitors: 1, productSlugs: 1 });
    expect(received).toEqual({
      product: full.products,
      makingOf: full.makingOf,
      instagramPost: [
        { id: "p1", caption: "Lora Bay at dusk", createdAt: "2026-10-01T05:00:00.000Z" },
        { id: "p2", caption: "Council Beach", createdAt: "2026-10-01T05:00:00.000Z" },
      ],
      excludedVisitor: full.excludedVisitors,
      productSlug: full.productSlugs,
    });
  });
});

describe("buildSnapshot", () => {
  it("reads every table, in a stable order so two snapshots diff cleanly, and stamps the snapshot", async () => {
    const asked: Record<string, unknown> = {};
    const table = (name: string, rows: unknown[]) => ({
      findMany: async (args?: unknown) => {
        asked[name] = args;
        return rows;
      },
    });
    const prisma = {
      product: table("product", [{ id: "a" }, { id: "b" }, { id: "c" }]),
      makingOf: table("makingOf", [{ id: "m" }]),
      instagramPost: table("instagramPost", [{ id: "p" }]),
      excludedVisitor: table("excludedVisitor", [{ id: "v" }]),
      productSlug: table("productSlug", [{ slug: "s" }]),
    };
    const s = await buildSnapshot(prisma as never, new Date("2026-10-06T12:00:00.000Z"));
    expect(s).toEqual({
      version: SNAPSHOT_VERSION,
      exportedAt: "2026-10-06T12:00:00.000Z",
      count: 3,
      products: [{ id: "a" }, { id: "b" }, { id: "c" }],
      makingOf: [{ id: "m" }],
      instagramPosts: [{ id: "p" }],
      excludedVisitors: [{ id: "v" }],
      productSlugs: [{ slug: "s" }],
    });
    expect(asked).toEqual({
      product: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] },
      makingOf: { orderBy: { sortOrder: "asc" } },
      instagramPost: { orderBy: { createdAt: "asc" } },
      excludedVisitor: undefined,
      productSlug: undefined,
    });
    expect(Object.keys(s).filter((k) => (TABLES as readonly string[]).includes(k))).toEqual([...TABLES]);
  });
});

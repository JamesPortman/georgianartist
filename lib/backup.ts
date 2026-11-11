import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

/**
 * The catalogue snapshot: what the backup cron writes and the restore drill
 * reads back (app/api/cron/backup, scripts/backup-drill.ts).
 *
 * The tables that are work rather than logs: the catalogue, the films' rows,
 * the Instagram queue with its approved captions, the excluded browsers and
 * the retired URL slugs. Analytics isn't here; it's large, and it's a record
 * rather than an asset. Neon's point-in-time restore covers the rest, for six
 * hours on the Free plan.
 *
 * Version 1 (until October 2026) had no `version` and no `productSlugs`;
 * restoreSnapshot() reads both.
 */

export const SNAPSHOT_VERSION = 2;

type Row = Record<string, unknown>;

export type Snapshot = {
  version?: number;
  exportedAt: string;
  count: number;
  products: Row[];
  makingOf: Row[];
  instagramPosts: Row[];
  excludedVisitors: Row[];
  productSlugs?: Row[];
};

/** The tables, in the order a restore inserts them. */
export const TABLES = ["products", "makingOf", "instagramPosts", "excludedVisitors", "productSlugs"] as const;
export type TableName = (typeof TABLES)[number];

export async function buildSnapshot(prisma: PrismaClient, now: Date = new Date()): Promise<Snapshot> {
  // One at a time: the Neon HTTP adapter has no transactions, and this keeps
  // the load on a cold database small.
  const products = await prisma.product.findMany({ orderBy: [{ type: "asc" }, { sortOrder: "asc" }] });
  const makingOf = await prisma.makingOf.findMany({ orderBy: { sortOrder: "asc" } });
  const instagramPosts = await prisma.instagramPost.findMany({ orderBy: { createdAt: "asc" } });
  const excludedVisitors = await prisma.excludedVisitor.findMany();
  const productSlugs = await prisma.productSlug.findMany();
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: now.toISOString(),
    count: products.length,
    products,
    makingOf,
    instagramPosts,
    excludedVisitors,
    productSlugs,
  };
}

/** A snapshot's rows, as they would round-trip through JSON. */
export const rowsOf = (s: Snapshot, t: TableName): Row[] => JSON.parse(JSON.stringify(s[t] ?? []));

/**
 * Per table: the row count and a hash of the rows, sorted and key-ordered, so
 * two snapshots compare equal exactly when they hold the same data.
 */
export function fingerprint(s: Snapshot): Record<TableName, { rows: number; sha256: string }> {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as Row).sort().map((k) => [k, canon((v as Row)[k])]))
        : v;
  const out = {} as Record<TableName, { rows: number; sha256: string }>;
  for (const t of TABLES) {
    const rows = rowsOf(s, t).map((r) => JSON.stringify(canon(r))).sort();
    out[t] = { rows: rows.length, sha256: createHash("sha256").update(rows.join("\n")).digest("hex") };
  }
  return out;
}

/**
 * Insert a snapshot into an EMPTY database whose schema is already pushed.
 * One createMany per table: a single statement each, so it works over the
 * Neon HTTP adapter, and a failure leaves whole tables, never half of one.
 */
export async function restoreSnapshot(prisma: PrismaClient, s: Snapshot): Promise<Record<TableName, number>> {
  const counts = {} as Record<TableName, number>;
  const insert: Record<TableName, (data: Row[]) => Promise<{ count: number }>> = {
    products: (data) => prisma.product.createMany({ data: data as never }),
    makingOf: (data) => prisma.makingOf.createMany({ data: data as never }),
    instagramPosts: (data) => prisma.instagramPost.createMany({ data: data as never }),
    excludedVisitors: (data) => prisma.excludedVisitor.createMany({ data: data as never }),
    productSlugs: (data) => prisma.productSlug.createMany({ data: data as never }),
  };
  for (const t of TABLES) {
    const rows = rowsOf(s, t);
    counts[t] = rows.length ? (await insert[t](rows)).count : 0;
  }
  return counts;
}

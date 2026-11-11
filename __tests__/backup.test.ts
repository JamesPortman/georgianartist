import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The snapshot holds hidden works and collectors' credits, so it goes to the
 * private store when there is one, and is unguessably named in the public one
 * when there isn't. It carries the small tables that are work rather than
 * logs, and it emails the owner when it can't be written.
 */

const blob = vi.hoisted(() => ({
  puts: [] as { path: string; body: string; opts: Record<string, unknown> }[],
  fail: false,
  listed: [] as { pathname: string; url: string }[],
  deleted: [] as { items: string[]; opts: unknown }[],
}));
const alerts = vi.hoisted(() => [] as string[]);

vi.mock("@vercel/blob", () => ({
  put: async (path: string, body: string, opts: Record<string, unknown>) => {
    if (blob.fail) throw new Error("store unavailable");
    blob.puts.push({ path, body, opts });
    return { url: `https://store.public.blob.vercel-storage.com/${path}`, pathname: path };
  },
  list: async () => ({ blobs: blob.listed, cursor: undefined }),
  del: async (items: string[], opts: unknown) => {
    blob.deleted.push({ items, opts });
  },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findMany: async () => [{ id: "lora-bay", visible: false }] },
    makingOf: { findMany: async () => [{ id: "film-1" }] },
    instagramPost: { findMany: async () => [{ id: "post-1", caption: "approved text" }] },
    excludedVisitor: { findMany: async () => [{ visitorId: "v1" }] },
    productSlug: { findMany: async () => [{ slug: "spirit-rock", productId: "spirit-rock" }] },
  },
}));
vi.mock("@/lib/notify", () => ({ sendAlert: async (subject: string) => { alerts.push(subject); } }));

const { GET } = await import("../app/api/cron/backup/route");
const SECRET = "test-cron-secret";
const run = () => GET(new Request("http://localhost/api/cron/backup", { headers: { authorization: `Bearer ${SECRET}` } }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  blob.puts.length = 0;
  blob.fail = false;
  blob.listed = [];
  blob.deleted = [];
  alerts.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/backup", () => {
  it("writes to the private store when there is one, named by date and time", async () => {
    vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "private-token");
    expect((await run()).status).toBe(200);
    expect(blob.puts).toHaveLength(1);
    const { path, body, opts } = blob.puts[0]!;
    expect(path).toMatch(/^backups\/catalog-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json$/);
    expect(opts).toMatchObject({ access: "private", token: "private-token" });
    const data = JSON.parse(body);
    expect(data.version).toBe(2);
    expect(data.products[0].id).toBe("lora-bay");
    expect(data.makingOf[0].id).toBe("film-1");
    expect(data.instagramPosts[0].caption).toBe("approved text");
    expect(data.excludedVisitors[0].visitorId).toBe("v1");
    expect(data.productSlugs[0].slug).toBe("spirit-rock");
  });

  it("falls back to an unguessable name in the public store without one", async () => {
    vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "");
    expect((await run()).status).toBe(200);
    // The store is public, so a random suffix is what keeps the URL private.
    expect(blob.puts[0]!.opts).toMatchObject({ access: "public", addRandomSuffix: true });
  });

  it("prunes snapshots older than a week in both stores, and only those", async () => {
    vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "private-token");
    blob.listed = [
      { pathname: "backups/catalog-2001-01-01T05-00.json", url: "https://x/old" },
      { pathname: `backups/catalog-${new Date().toISOString().slice(0, 10)}T00-00.json`, url: "https://x/new" },
    ];
    await run();
    // Public store by URL, private by pathname with its token.
    expect(blob.deleted).toEqual([
      { items: ["https://x/old"], opts: undefined },
      { items: ["backups/catalog-2001-01-01T05-00.json"], opts: { token: "private-token" } },
    ]);
  });

  it("emails the owner when the snapshot can't be written", async () => {
    blob.fail = true;
    expect((await run()).status).toBe(500);
    expect(alerts).toEqual(["Catalogue backup failed"]);
  });

  it("refuses a request without the cron secret", async () => {
    expect((await GET(new Request("http://localhost/api/cron/backup"))).status).toBe(401);
  });
});

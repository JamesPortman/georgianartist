import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Admin uploads in the private Blob store are served by /media only while a
 * visible work uses them, or to a signed-in admin. So a work uploaded hidden
 * can't be seen before it's published, a collector's photo stops being served
 * when it is removed or its work is hidden, and nothing else in the private
 * store (the backups) can be asked for at all.
 *
 * The fake database answers the route's query against a small catalogue
 * rather than returning a row whatever it was asked: mutation testing found
 * that with the old fake, deleting `visible: true` from the query, or which
 * image fields it matched, passed every test.
 */

type Row = { id: string; visible: boolean; image: string; inspirationImage: string | null; homePhoto: string | null };
type Where = { visible?: boolean; OR?: Partial<Record<"image" | "inspirationImage" | "homePhoto", string>>[] };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  admin: false,
  sessionReads: 0,
  gets: [] as { pathname: string; options: unknown }[],
  file: undefined as undefined | null | { statusCode: number; contentType?: string },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findFirst: async ({ where, select }: { where: Where; select: Record<string, boolean> }) => {
        const row = state.rows.find(
          (r) =>
            (where.visible === undefined || r.visible === where.visible) &&
            (where.OR ?? []).some((cond) =>
              Object.entries(cond).every(([k, v]) => r[k as keyof Row] === v)
            )
        );
        // Only the selected fields, as Prisma returns them.
        return row ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k as keyof Row]])) : null;
      },
    },
  },
}));
vi.mock("@/lib/session", () => ({
  getAdminSession: async () => {
    state.sessionReads++;
    return { isLoggedIn: state.admin };
  },
}));
vi.mock("@vercel/blob", () => ({
  get: async (pathname: string, options: unknown) => {
    state.gets.push({ pathname, options });
    if (state.file === null) return null;
    const f = state.file ?? { statusCode: 200, contentType: "image/jpeg" };
    return {
      statusCode: f.statusCode,
      stream: new Response("jpeg-bytes").body,
      blob: { contentType: f.contentType, etag: '"abc"', size: 10 },
    };
  },
}));

const route = await import("../app/media/[...path]/route");
const fetchMedia = (path: string) =>
  route.GET(new Request(`http://localhost/media/${path}`), { params: Promise.resolve({ path: path.split("/") }) });

const work = (over: Partial<Row>): Row => ({
  id: "lora-bay",
  visible: true,
  image: "/media/paintings/lora-bay.jpg",
  inspirationImage: null,
  homePhoto: null,
  ...over,
});

beforeEach(() => {
  state.rows = [
    work({}),
    work({
      id: "new-work",
      visible: false,
      image: "/media/paintings/new-work.jpg",
      homePhoto: "/media/homes/new-home.jpg",
    }),
    work({
      id: "with-photos",
      image: "/media/paintings/with-photos.jpg",
      inspirationImage: "/media/inspiration/shore.jpg",
      homePhoto: "/media/homes/collector.jpg",
    }),
  ];
  state.admin = false;
  state.sessionReads = 0;
  state.gets = [];
  state.file = undefined;
  vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "private-token");
});
afterEach(() => vi.unstubAllEnvs());

describe("/media", () => {
  it("serves a visible work's upload, cacheable, with what the repaint check reads", async () => {
    const res = await fetchMedia("paintings/lora-bay.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=600, s-maxage=600");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("content-length")).toBe("10");
    expect(await res.text()).toBe("jpeg-bytes");
    expect(state.gets).toEqual([
      { pathname: "paintings/lora-bay.jpg", options: { access: "private", token: "private-token" } },
    ]);
  });

  it.each([
    ["its image", "paintings/with-photos.jpg"],
    ["its inspiration photo", "inspiration/shore.jpg"],
    ["a collector's photo", "homes/collector.jpg"],
  ])("serves a visible work's %s to the public", async (_, path) => {
    expect((await fetchMedia(path)).status).toBe(200);
  });

  it("decides without reading the session when a visible work uses the file", async () => {
    await fetchMedia("paintings/lora-bay.jpg");
    expect(state.sessionReads).toBe(0);
  });

  it.each([
    ["a hidden work's image", "paintings/new-work.jpg"],
    ["a hidden work's collector photo", "homes/new-home.jpg"],
    ["a file no work uses", "paintings/orphan.jpg"],
  ])("is a 404 to the public for %s, without reading the store", async (_, path) => {
    const res = await fetchMedia(path);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(state.gets).toEqual([]);
  });

  it("serves a hidden work's upload to the signed-in admin, never cached", async () => {
    state.admin = true;
    const res = await fetchMedia("paintings/new-work.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "backups/catalog-2026-10-01T05-00.json",
    "paintings/../backups/catalog.json",
    "homes/sub/dir.jpg",
    "other/file.jpg",
  ])("never reaches anything outside the upload folders, even for the admin: %s", async (path) => {
    state.admin = true;
    expect((await fetchMedia(path)).status).toBe(404);
    expect(state.gets).toEqual([]);
  });

  it("is a 404 when there is no private store", async () => {
    vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "");
    expect((await fetchMedia("paintings/lora-bay.jpg")).status).toBe(404);
  });

  it.each([
    ["missing from the store", null],
    ["answered with an error", { statusCode: 500 }],
  ])("is a 404 when the file is %s", async (_, file) => {
    state.file = file;
    const res = await fetchMedia("paintings/lora-bay.jpg");
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("labels a file the store has no type for as plain bytes", async () => {
    state.file = { statusCode: 200 };
    expect((await fetchMedia("paintings/lora-bay.jpg")).headers.get("content-type")).toBe(
      "application/octet-stream"
    );
  });

  it("is never prerendered: every request asks the database", () => {
    expect(route.dynamic).toBe("force-dynamic");
  });
});

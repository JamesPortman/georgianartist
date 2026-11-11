import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const calls = vi.hoisted(() => ({ put: [] as { pathname: string; opts: Record<string, unknown> }[], del: [] as unknown[] }));
vi.mock("@vercel/blob", () => ({
  put: async (pathname: string, _body: unknown, opts: Record<string, unknown>) => {
    calls.put.push({ pathname, opts });
    const stored = opts.addRandomSuffix ? pathname.replace(".jpg", "-r4nd0m.jpg") : pathname;
    return { url: `https://x.public.blob.vercel-storage.com/${stored}`, pathname: stored };
  },
  del: async (...args: unknown[]) => {
    calls.del.push(args);
  },
}));

const { uploadMedia, deleteMedia, mediaPathname } = await import("../lib/private-blob");

beforeEach(() => {
  calls.put = [];
  calls.del = [];
});
afterEach(() => vi.unstubAllEnvs());

/**
 * Admin uploads go to the private store when it exists, held as /media paths;
 * until then, to the public store exactly as before, so this deploys safely
 * ahead of the store being created.
 */
describe("uploadMedia", () => {
  it("uses the private store, and returns a /media path, once it exists", async () => {
    vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "private-token");
    const url = await uploadMedia("homes/lora-bay.jpg", Buffer.from("x"), { contentType: "image/jpeg", addRandomSuffix: true });
    expect(url).toBe("/media/homes/lora-bay-r4nd0m.jpg");
    expect(calls.put[0]!.opts).toMatchObject({ access: "private", token: "private-token" });
  });

  it("falls back to the public store, as before, without one", async () => {
    vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "");
    const url = await uploadMedia("paintings/x.jpg", Buffer.from("x"), { contentType: "image/jpeg", addRandomSuffix: false });
    expect(url).toBe("https://x.public.blob.vercel-storage.com/paintings/x.jpg");
    expect(calls.put[0]!.opts).toMatchObject({ access: "public" });
  });
});

describe("mediaPathname", () => {
  it.each([
    ["/media/homes/lora-bay-abc.jpg", "homes/lora-bay-abc.jpg"],
    ["/media/inspiration/x_1.jpg?v=2", "inspiration/x_1.jpg"],
    ["/media/backups/catalog.json", null],
    ["/media/paintings/../backups/x.json", null],
    ["/media/paintings/a/b.jpg", null],
    ["/paintings/x.jpg", null],
    ["https://x.public.blob.vercel-storage.com/homes/x.jpg", null],
  ])("%s → %s", (url, expected) => {
    expect(mediaPathname(url)).toBe(expected);
  });
});

describe("deleteMedia", () => {
  it("deletes by pathname with the private token, and nothing outside the upload folders", async () => {
    vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "private-token");
    await deleteMedia("/media/homes/x.jpg");
    await deleteMedia("/media/backups/catalog.json");
    expect(calls.del).toEqual([["homes/x.jpg", { token: "private-token" }]]);
  });
});

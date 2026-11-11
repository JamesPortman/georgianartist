import { describe, it, expect, vi, afterEach } from "vitest";
import { mediaHasChanged, fetchMediaFingerprint } from "../lib/instagram";

afterEach(() => vi.unstubAllGlobals());

/**
 * A repaint replaces the file behind an unchanged URL, so a queued caption can
 * end up describing a painting that no longer exists — wrong subject, wrong
 * sizes, wrong price — with nothing looking broken. The cron compares a
 * fingerprint taken when the caption was written against the live one.
 *
 * The bias here is deliberate: only a CONFIDENT mismatch blocks a post.
 * Refusing to publish because a HEAD request failed would be worse than the
 * problem being guarded against.
 */
describe("mediaHasChanged", () => {
  it("blocks when the media genuinely changed", () => {
    expect(mediaHasChanged('"abc"|1024', '"xyz"|2048')).toBe(true);
  });

  it("allows when it is byte-identical", () => {
    expect(mediaHasChanged('"abc"|1024', '"abc"|1024')).toBe(false);
  });

  it("allows when there is no baseline; a row queued before fingerprints existed", () => {
    expect(mediaHasChanged(null, '"abc"|1024')).toBe(false);
  });

  it("allows when the current value cannot be read; a HEAD failure must not block a post", () => {
    expect(mediaHasChanged('"abc"|1024', null)).toBe(false);
  });

  it("allows when neither is known", () => {
    expect(mediaHasChanged(null, null)).toBe(false);
  });

  it("notices a size change even when the etag is missing", () => {
    expect(mediaHasChanged("|1024", "|2048")).toBe(true);
  });
});

describe("fetchMediaFingerprint", () => {
  const withFetch = (impl: unknown) => vi.stubGlobal("fetch", impl);

  it("combines etag and length", async () => {
    withFetch(async () => ({
      ok: true,
      headers: new Headers({ etag: '"abc"', "content-length": "1024" }),
    }));
    expect(await fetchMediaFingerprint("https://x/y.jpg")).toBe('"abc"|1024');
  });

  it("works from length alone when no etag is served", async () => {
    withFetch(async () => ({ ok: true, headers: new Headers({ "content-length": "1024" }) }));
    expect(await fetchMediaFingerprint("https://x/y.jpg")).toBe("|1024");
  });

  it("returns null when the server offers neither header", async () => {
    withFetch(async () => ({ ok: true, headers: new Headers() }));
    expect(await fetchMediaFingerprint("https://x/y.jpg")).toBeNull();
  });

  it("returns null on a non-OK response rather than throwing", async () => {
    withFetch(async () => ({ ok: false, headers: new Headers() }));
    expect(await fetchMediaFingerprint("https://x/y.jpg")).toBeNull();
  });

  it("returns null when the request throws; never propagates into the cron", async () => {
    withFetch(async () => { throw new Error("network down"); });
    await expect(fetchMediaFingerprint("https://x/y.jpg")).resolves.toBeNull();
  });

  it("uses HEAD, so it never downloads a 15MB reel to check it", async () => {
    const seen: RequestInit[] = [];
    withFetch(async (_u: string, init: RequestInit) => {
      seen.push(init);
      return { ok: true, headers: new Headers({ "content-length": "1" }) };
    });
    await fetchMediaFingerprint("https://x/reel.mp4");
    expect(seen[0]!.method).toBe("HEAD");
  });
});

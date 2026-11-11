import { describe, it, expect, vi, beforeEach } from "vitest";

const works = vi.hoisted(() => ({ paintings: [] as { id: string; title: string; image: string }[] }));
const resize = vi.hoisted(() => vi.fn());
const sharpCalls = vi.hoisted(() => ({ value: [] as unknown[] }));
/** Lets a test make the encode itself fail, not just the fetch. */
const sharpBuffer = vi.hoisted(() => ({ value: () => Buffer.from("jpeg-bytes") }));

vi.mock("@/lib/showcase", () => ({
  getVisibleWorks: async () => works.paintings,
  showcaseFor: (list: unknown[]) => (list.length ? list[0] : null),
}));

vi.mock("sharp", () => {
  const chain = {
    resize: (...args: unknown[]) => {
      resize(...args);
      return chain;
    },
    jpeg: () => chain,
    toBuffer: async () => sharpBuffer.value(),
  };
  // Called both as sharp(bytes) and as sharp({ create }) for the blank card.
  return { default: (arg: unknown) => { sharpCalls.value.push(arg); return chain; } };
});

const { GET } = await import("../app/api/og-image/route");
const { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, OG_SOURCE_TIMEOUT_MS, OG_CARD_BACKGROUND } =
  await import("../lib/og-image");
const { metadata } = await import("../app/layout");

const request = () => new Request("https://www.georgianartist.com/api/og-image");
const painting = { id: "lora-bay", title: "Lora Bay", image: "/paintings/lora-bay.jpg" };

beforeEach(() => {
  works.paintings = [painting];
  resize.mockReset();
  sharpCalls.value = [];
  sharpBuffer.value = () => Buffer.from("jpeg-bytes");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
  );
});

/**
 * The link preview is the one part of the site whose failures are invisible
 * from inside it. Every page renders, the build is green, and the link just
 * shares as a blank rectangle on somebody else's timeline.
 *
 * Two versions of that have now happened. The first: layout.tsx named an image
 * by path, the painting was hidden, and every share advertised work nobody
 * could buy — that is what the request-time lookup fixes. The second: the
 * route answered with a 302 to a 2400 x 1201, 1.5MB file while the tag claimed
 * 1200 wide, and LinkedIn built a card on the second attempt but not the
 * first. Intermittent, so testing it by hand proves nothing.
 *
 * Hence the two properties below: the crawler gets bytes rather than a hop,
 * and the size it was promised is the size it receives.
 */
describe("site Open Graph image", () => {
  it("answers with the image itself, not a redirect to it", async () => {
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("location"), "a crawler should not have to follow a hop").toBeNull();
  });

  it("names the work it rendered, so staleness stays checkable end to end", async () => {
    // The bytes no longer carry a filename, and "is the preview advertising
    // something still for sale" is the question this route exists to answer.
    expect((await GET(request())).headers.get("x-og-work")).toBe("lora-bay");
  });

  it("serves exactly the dimensions the meta tag advertises", async () => {
    await GET(request());

    expect(resize).toHaveBeenCalledWith(
      OG_IMAGE_WIDTH,
      OG_IMAGE_HEIGHT,
      expect.objectContaining({ fit: "contain" }),
    );
  });

  it("letterboxes rather than cropping, so the whole work survives", async () => {
    // Almost nothing in the catalogue is 1.91:1 — "Bruce Trail" is 1799 x 2400
    // and "Inglis Falls" is square — so `cover` would centre-crop away 61% and
    // 48% of them. A preview of the middle band of a painting is worse than a
    // small painting with margins.
    await GET(request());

    const [, , opts] = resize.mock.calls[0] as [number, number, Record<string, unknown>];
    expect(opts.fit).toBe("contain");
    expect(opts.fit).not.toBe("cover");
    expect(opts.background).toEqual(OG_CARD_BACKGROUND);
  });

  it("gives up on a stalled source instead of running to the platform limit", async () => {
    // Without a bound the request never fails — it is killed by the platform
    // and the crawler gets a 504, which is worse than the redirect this route
    // replaced, because that at least answered instantly.
    // Typed with both parameters so the assertion below can reach `init` —
    // a zero-arg mock gives calls the tuple type [] and index 1 does not exist.
    const fetchMock = vi.fn(
      async (_input: unknown, _init?: RequestInit) =>
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await GET(request());

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal, "the source fetch is unbounded").toBeInstanceOf(AbortSignal);
    expect(OG_SOURCE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(OG_SOURCE_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("declares those same dimensions in the document head", () => {
    // Asserted against the exported metadata rather than the text of
    // layout.tsx: a source grep passes on a commented-out match and fails on a
    // reformat, neither of which is the thing that matters.
    const image = (metadata.openGraph?.images as { width?: number; height?: number }[])[0];

    expect(image!.width).toBe(OG_IMAGE_WIDTH);
    expect(image!.height).toBe(OG_IMAGE_HEIGHT);
  });

  it("still answers at the declared size when the source cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const res = await GET(request());

    // Not a redirect to the original: that file is 2400 wide against a tag
    // claiming 1200, which is the mismatch this route exists to stop making.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-og-work"), "the degraded card names the work too").toBe("lora-bay");

    // Built from a create-spec at the card's size, not from the source bytes.
    const spec = sharpCalls.value.at(-1) as { create?: Record<string, unknown> };
    expect(spec.create).toMatchObject({ width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT });
  });

  it("caches the degraded card briefly, so a transient failure is not sticky", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const maxAge = Number(
      /max-age=(\d+)/.exec((await GET(request())).headers.get("cache-control") ?? "")?.[1],
    );
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(300);
  });

  it("says so in the logs when it falls back", async () => {
    // These failures are invisible from inside the site: every page renders,
    // the build is green, and only the shared link is wrong.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await GET(request());

    expect(console.error).toHaveBeenCalled();
    expect(String((console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]))
      .toContain("lora-bay");
  });

  it("redirects only when sharp itself cannot encode anything", async () => {
    sharpBuffer.value = () => {
      throw new Error("sharp unavailable");
    };

    const res = await GET(request());

    // Last resort. The redirect is wrong about its dimensions and it is all
    // that is left.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.georgianartist.com/paintings/lora-bay.jpg");
    expect(res.headers.get("x-og-work")).toBe("lora-bay");
  });

  it("serves nothing rather than something broken when the catalogue is empty", async () => {
    works.paintings = [];

    expect((await GET(request())).status).toBe(404);
  });
});

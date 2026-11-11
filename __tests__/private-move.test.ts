import { describe, it, expect } from "vitest";
import { movablePathname, planMoves } from "../lib/private-move";

const HOST = "https://abc123.public.blob.vercel-storage.com";

describe("movablePathname", () => {
  it("takes upload-folder files from a public store", () => {
    expect(movablePathname(`${HOST}/homes/lone-pine-q1w2e3.jpg`)).toBe("homes/lone-pine-q1w2e3.jpg");
    expect(movablePathname(`${HOST}/paintings/lora-bay-xyz.jpg?v=2`)).toBe("paintings/lora-bay-xyz.jpg");
  });

  it("leaves the catalogue, other folders, site paths and nothing alone", () => {
    for (const url of [
      `${HOST}/catalogue/paintings/lora-bay.jpg`,
      `${HOST}/backups/catalog-2026-10-01.json`,
      `${HOST}/making-of/film.mp4`,
      "/media/homes/x.jpg",
      "https://example.com/homes/x.jpg",
      null,
    ]) {
      expect(movablePathname(url)).toBeNull();
    }
  });

  it("refuses a pathname /media would not serve", () => {
    expect(movablePathname(`${HOST}/homes/a/b.jpg`)).toBeNull();
    expect(movablePathname(`${HOST}/homes/..%2Fbackups.json`)).toBeNull();
  });
});

describe("planMoves", () => {
  const work = (over: Partial<Parameters<typeof planMoves>[0][number]> = {}) => ({
    id: "lora-bay",
    visible: true,
    image: `${HOST}/paintings/lora-bay-1.jpg`,
    inspirationImage: `${HOST}/inspiration/lora-bay-2.jpg`,
    homePhoto: `${HOST}/homes/lora-bay-3.jpg`,
    ...over,
  });

  it("moves only the home photo of a published work", () => {
    expect(planMoves([work()])).toEqual([
      {
        productId: "lora-bay",
        field: "homePhoto",
        from: `${HOST}/homes/lora-bay-3.jpg`,
        pathname: "homes/lora-bay-3.jpg",
        to: "/media/homes/lora-bay-3.jpg",
      },
    ]);
  });

  it("moves every upload of a hidden work", () => {
    expect(planMoves([work({ visible: false })]).map((m) => m.field)).toEqual(["image", "inspirationImage", "homePhoto"]);
  });

  it("skips what is already private or not an upload", () => {
    const moves = planMoves([
      work({ visible: false, image: "/media/paintings/x.jpg", inspirationImage: null, homePhoto: `${HOST}/catalogue/homes/y.jpg` }),
    ]);
    expect(moves).toEqual([]);
  });
});

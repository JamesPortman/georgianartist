// @vitest-environment node
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { prepareHomePhoto } from "../lib/home-photo";

/**
 * A collector's photo of a work in their home is published on a public URL,
 * and a phone photo's EXIF carries GPS — for a photo taken in someone's house,
 * their address. These tests hand prepareHomePhoto() files that carry GPS and
 * check that nothing readable comes out the other side.
 *
 * The PNG case is the one that failed. The first version used stripMetadata(),
 * which only understands JPEG and returns anything else byte-for-byte, so a PNG
 * carrying GPS was published with it intact.
 */
const GPS = {
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "44/1 33/1 15/1",
    GPSLongitudeRef: "W",
    GPSLongitude: "80/1 24/1 4/1",
  },
};

const canvas = () =>
  sharp({ create: { width: 40, height: 20, channels: 3, background: "#6b8" } });

async function withGps(format: "png" | "jpeg" | "webp") {
  const buf = await canvas()[format]().withExif(GPS).toBuffer();
  // Guard the test itself: if the fixture carried no GPS, every assertion
  // below would pass without proving anything.
  expect((await sharp(buf).metadata()).exif).toBeDefined();
  return buf;
}

async function carriesNoMetadata(buf: Buffer) {
  const m = await sharp(buf).metadata();
  expect(m.exif).toBeUndefined();
  expect(m.xmp).toBeUndefined();
  expect(m.iptc).toBeUndefined();
}

describe("prepareHomePhoto", () => {
  for (const format of ["png", "jpeg", "webp"] as const) {
    it(`removes GPS from a ${format.toUpperCase()}`, async () => {
      await carriesNoMetadata(await prepareHomePhoto(await withGps(format)));
    });
  }

  it("always writes a JPEG, whatever arrived", async () => {
    // The upload stores it as homes/<id>.jpg with an image/jpeg type, so a
    // PNG passed through would be a lie in two places.
    const out = await prepareHomePhoto(await withGps("png"));
    expect((await sharp(out).metadata()).format).toBe("jpeg");
  });

  it("turns a sideways phone photo upright before dropping the flag that said so", async () => {
    // Stored 40x20 with EXIF orientation 6 (rotate 90° to view). Without
    // .rotate() the tag would go and the photo would stay on its side.
    const sideways = await canvas().jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const m = await sharp(await prepareHomePhoto(sideways)).metadata();
    expect([m.width, m.height]).toEqual([20, 40]);
    expect(m.orientation).toBeUndefined();
  });

  it("refuses a file it cannot read, rather than publishing it as-is", async () => {
    // Failing open is what leaked the PNG. An unreadable file must stop the
    // upload; the admin can retry, the collector cannot un-publish.
    await expect(prepareHomePhoto(Buffer.from("not an image at all"))).rejects.toThrow();
  });
});

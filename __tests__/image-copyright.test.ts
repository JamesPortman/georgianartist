import { describe, it, expect } from "vitest";
import { embedCopyright, stripMetadata } from "../lib/image-copyright";
import { ARTIST, CREDIT, SITE, copyrightNotice } from "../lib/copyright";

/**
 * Images uploaded through the admin go straight to Vercel Blob from a
 * serverless function, where exiftool doesn't exist — so they shipped with no
 * authorship claim at all while the repo's files were tagged. This writes the
 * same claim by hand.
 *
 * Two things matter more than the metadata: the pixels must survive untouched,
 * and a file this can't parse must come back exactly as it went in. A missing
 * copyright notice is a small problem; a corrupted or rejected upload of a
 * painting is a real one.
 */

const NOW = new Date("2026-09-11T12:00:00Z");

/** A minimal but structurally valid JPEG: SOI, APP0/JFIF, SOS, scan, EOI. */
function fakeJpeg({ withExif = false, withXmp = false, withIcc = false } = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];

  const segment = (marker: number, payload: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt8(0xff, 0);
    head.writeUInt8(marker, 1);
    head.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([head, payload]);
  };

  parts.push(segment(0xe0, Buffer.from("JFIF\0\x01\x02\0\0\x01\0\x01\0\0", "latin1")));
  if (withExif) parts.push(segment(0xe1, Buffer.from("Exif\0\0OLD-EXIF-DATA", "latin1")));
  if (withXmp) {
    parts.push(
      segment(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>", "latin1"))
    );
  }
  // The browser's canvas emits an APP2 ICC colour profile on every upload —
  // measured against a real toBlob() JPEG, whose segments are APP0 then APP2.
  // Losing or corrupting it would shift the colours of every uploaded painting.
  if (withIcc) {
    parts.push(segment(0xe2, Buffer.concat([
      Buffer.from("ICC_PROFILE\0", "latin1"),
      Buffer.from([1, 1]),
      Buffer.from("pretend-icc-profile-body".repeat(8), "latin1"),
    ])));
  }
  // A comment segment stands in for "some other metadata the file carried".
  parts.push(segment(0xfe, Buffer.from("a comment", "latin1")));
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x02])); // SOS
  parts.push(Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55])); // "scan data"
  parts.push(Buffer.from([0xff, 0xd9])); // EOI
  return Buffer.concat(parts);
}

/** Everything from SOS onward — the compressed pixels. */
function scanData(jpeg: Buffer): Buffer {
  const at = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  return jpeg.subarray(at);
}

const app1Payloads = (jpeg: Buffer): string[] => {
  const out: string[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length) {
    if (jpeg[at] !== 0xff) break;
    const marker = jpeg[at + 1];
    if (marker === 0xda) break;
    const length = jpeg.readUInt16BE(at + 2);
    // utf8, not latin1: the notice contains "©" and an en dash.
    if (marker === 0xe1) out.push(jpeg.subarray(at + 4, at + 2 + length).toString("utf8"));
    at += 2 + length;
  }
  return out;
};

describe("embedCopyright", () => {
  it("writes the notice into both EXIF and XMP", () => {
    const out = embedCopyright(fakeJpeg(), NOW);
    const payloads = app1Payloads(out);
    const notice = copyrightNotice(NOW);

    const exif = payloads.find((p) => p.startsWith("Exif\0\0"));
    const xmp = payloads.find((p) => p.startsWith("http://ns.adobe.com/xap/1.0/\0"));

    expect(exif).toContain(notice);
    expect(exif).toContain(ARTIST);
    expect(xmp).toContain(notice);
    expect(xmp).toContain(ARTIST);
  });

  it("keeps the rights holder and the credit line as separate claims", () => {
    const xmp = app1Payloads(embedCopyright(fakeJpeg(), NOW)).find((p) =>
      p.startsWith("http://ns.adobe.com/xap/1.0/\0")
    )!;
    // The holder is in dc:rights; the brand is only ever a credit.
    expect(xmp).toContain(`<photoshop:Credit>${CREDIT}</photoshop:Credit>`);
    expect(xmp).toContain(`<xmpRights:WebStatement>${SITE}</xmpRights:WebStatement>`);
    expect(xmp).not.toContain(`<rdf:li xml:lang="x-default">© 2021–2026 ${CREDIT}`);
  });

  it("never touches the pixels", () => {
    const src = fakeJpeg();
    const out = embedCopyright(src, NOW);
    expect(scanData(out).equals(scanData(src))).toBe(true);
  });

  it("keeps APP0/JFIF first, as the format requires", () => {
    const out = embedCopyright(fakeJpeg(), NOW);
    expect(out[2]).toBe(0xff);
    expect(out[3]).toBe(0xe0);
  });

  it("preserves segments it doesn't own, like the comment", () => {
    const out = embedCopyright(fakeJpeg(), NOW);
    expect(out.toString("latin1")).toContain("a comment");
  });

  it("replaces existing EXIF rather than appending a second copy", () => {
    const out = embedCopyright(fakeJpeg({ withExif: true }), NOW);
    const exifs = app1Payloads(out).filter((p) => p.startsWith("Exif\0\0"));
    // Readers take the first APP1 they find, so a duplicate would silently win.
    expect(exifs).toHaveLength(1);
    expect(exifs[0]).not.toContain("OLD-EXIF-DATA");
  });

  it("replaces existing XMP rather than appending a second copy", () => {
    const out = embedCopyright(fakeJpeg({ withXmp: true }), NOW);
    const xmps = app1Payloads(out).filter((p) =>
      p.startsWith("http://ns.adobe.com/xap/1.0/\0")
    );
    expect(xmps).toHaveLength(1);
  });

  it("preserves the ICC colour profile the browser canvas attaches", () => {
    const src = fakeJpeg({ withIcc: true });
    const out = embedCopyright(src, NOW);
    const icc = (b: Buffer) => {
      let at = 2;
      while (at + 4 <= b.length && b[at] === 0xff) {
        const marker = b[at + 1];
        if (marker === 0xda) break;
        const length = b.readUInt16BE(at + 2);
        if (marker === 0xe2) return b.subarray(at + 4, at + 2 + length);
        at += 2 + length;
      }
      return null;
    };
    expect(icc(out)).not.toBeNull();
    expect(icc(out)!.equals(icc(src)!)).toBe(true);
  });

  it("puts our segments between APP0 and APP2, the order the format expects", () => {
    const out = embedCopyright(fakeJpeg({ withIcc: true }), NOW);
    const markers: number[] = [];
    let at = 2;
    while (at + 4 <= out.length && out[at] === 0xff) {
      const marker = out[at + 1]!;
      if (marker === 0xda) break;
      markers.push(marker);
      at += 2 + out.readUInt16BE(at + 2);
    }
    // APP0 (JFIF), APP1 (EXIF), APP1 (XMP), APP2 (ICC), …
    expect(markers.slice(0, 4)).toEqual([0xe0, 0xe1, 0xe1, 0xe2]);
  });

  it("is idempotent; re-running produces a byte-identical file", () => {
    const once = embedCopyright(fakeJpeg(), NOW);
    const twice = embedCopyright(once, NOW);
    expect(twice.equals(once)).toBe(true);
  });

  it("rolls the end year over on its own", () => {
    // Local-time constructor on purpose: the notice reads getFullYear(), so a
    // UTC midnight would land in the previous year west of Greenwich.
    const out = embedCopyright(fakeJpeg(), new Date(2031, 5, 15));
    expect(out.toString("utf8")).toContain("© 2021–2031 James Portman");
  });

  describe("never costs someone their upload", () => {
    it.each([
      ["an empty buffer", Buffer.alloc(0)],
      ["a PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      ["plain text", Buffer.from("not an image at all")],
      ["a truncated JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      ["a JPEG with a bad segment length", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01])],
      ["a JPEG that never reaches its scan", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02])],
    ])("returns %s unchanged instead of throwing", (_label, input) => {
      expect(embedCopyright(input, NOW).equals(input)).toBe(true);
    });
  });
});

/**
 * Blur placeholders are base64'd into data/blurs.ts, which ships in the bundle
 * wherever a ProductCard renders. `sips` copies the source's metadata into the
 * 10px thumbnail it makes, so once the catalogue carried a copyright notice
 * every placeholder grew from ~860 bytes to ~4400 — a ten-pixel image with a
 * full EXIF and XMP rights statement attached. It also made the output depend
 * on metadata, so touching one file rewrote all 44 entries.
 */
describe("stripMetadata", () => {
  it("removes EXIF, XMP and ICC but keeps the pixels", () => {
    const src = embedCopyright(fakeJpeg({ withIcc: true }), NOW);
    const out = stripMetadata(src);
    expect(out.toString("utf8")).not.toContain("James Portman");
    expect(out.toString("latin1")).not.toContain("ICC_PROFILE");
    expect(scanData(out).equals(scanData(src))).toBe(true);
  });

  it("drops the comment segment too", () => {
    const out = stripMetadata(fakeJpeg());
    expect(out.toString("latin1")).not.toContain("a comment");
  });

  it("keeps the tables and headers needed to decode", () => {
    const out = stripMetadata(embedCopyright(fakeJpeg({ withIcc: true }), NOW));
    const markers: number[] = [];
    let at = 2;
    while (at + 4 <= out.length && out[at] === 0xff) {
      const marker = out[at + 1]!;
      if (marker === 0xda) break;
      markers.push(marker);
      at += 2 + out.readUInt16BE(at + 2);
    }
    // No APPn (0xE0-0xEF) and no COM (0xFE) left.
    expect(markers.some((m) => (m >= 0xe0 && m <= 0xef) || m === 0xfe)).toBe(false);
  });

  it("makes output independent of metadata; the whole point", () => {
    const bare = fakeJpeg();
    const tagged = embedCopyright(bare, NOW);
    // Same pixels, wildly different metadata, identical stripped result.
    expect(stripMetadata(tagged).equals(stripMetadata(bare))).toBe(true);
  });

  it("is idempotent", () => {
    const once = stripMetadata(fakeJpeg({ withIcc: true }));
    expect(stripMetadata(once).equals(once)).toBe(true);
  });

  it.each([
    ["an empty buffer", Buffer.alloc(0)],
    ["a PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["a truncated JPEG", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
  ])("returns %s unchanged", (_label, input) => {
    expect(stripMetadata(input).equals(input)).toBe(true);
  });
});

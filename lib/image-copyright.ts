/**
 * Write copyright metadata into a JPEG, in pure JS.
 *
 * `scripts/embed-copyright.js` shells out to exiftool for the images committed
 * to the repo. Images uploaded through the admin can't use it: they're written
 * straight to Vercel Blob from a serverless function, where there is no
 * exiftool and no filesystem to run it on. So those uploads have always gone
 * out bare, which is the half of the catalogue most likely to be downloaded
 * and reshared.
 *
 * This writes the same claim by hand. It covers EXIF (Artist, Copyright) and
 * XMP (the modern superset — what Google Images and Adobe tools actually
 * read). It does NOT write IPTC: that lives in an APP13 Photoshop resource
 * block whose nested structure is far more work to synthesise, and XMP already
 * carries the same fields for every reader that matters.
 *
 * JPEG layout, for the surgery below:
 *
 *     FFD8                        SOI
 *     FFE0 <len> "JFIF\0" …       APP0, usually present
 *     FFE1 <len> "Exif\0\0" …     APP1, EXIF (what we write)
 *     FFE1 <len> "http://ns…\0" … APP1, XMP  (what we write)
 *     …                           more segments
 *     FFDA …                      SOS, then entropy-coded data to EOI
 *
 * `len` is big-endian and counts itself, so payload length is len - 2.
 *
 * The bias throughout is that metadata must never cost someone their upload:
 * anything unexpected returns the original buffer untouched rather than
 * throwing. A missing copyright notice is a small problem; a failed upload of
 * a painting is a real one.
 */

import {
  ARTIST,
  CREDIT,
  EMAIL,
  SITE,
  USAGE_TERMS,
  copyrightNotice,
} from "@/lib/copyright";

const SOI = 0xd8;
const SOS = 0xda;
const APP0 = 0xe0;
const APP1 = 0xe1;

const EXIF_ID = "Exif\0\0";
const XMP_ID = "http://ns.adobe.com/xap/1.0/\0";

/** Largest a JPEG segment can be — the length field is 16 bits and counts itself. */
const MAX_SEGMENT = 0xffff;

const TAG_ARTIST = 0x013b;
const TAG_YCBCR_POSITIONING = 0x0213;
const TAG_COPYRIGHT = 0x8298;
const TYPE_SHORT = 3;
const TYPE_ASCII = 2;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A minimal big-endian TIFF block holding IFD0 with Artist and Copyright.
 *
 * Both are ASCII-typed but hold UTF-8 bytes, because the notice contains "©"
 * and an en dash. That's what exiftool writes for the same string, so the
 * repo's images and these agree byte for byte — and every reader we care
 * about decodes it.
 *
 * Entries must be in ascending tag order. A value of 4 bytes or fewer is
 * stored inline in the entry itself; anything longer goes in a data area after
 * the IFD, referenced by an offset relative to the start of the TIFF header.
 *
 * YCbCrPositioning is here only because EXIF requires it in IFD0 — without it
 * `exiftool -validate` warns. 1 means centered, which is what JFIF uses.
 */
function buildExifPayload(notice: string): Buffer {
  const ascii = (s: string) => ({ type: TYPE_ASCII, value: Buffer.from(`${s}\0`, "utf8") });
  const short = (n: number) => {
    const value = Buffer.alloc(2);
    value.writeUInt16BE(n, 0);
    return { type: TYPE_SHORT, value };
  };

  // Ascending tag order is a hard requirement of the format.
  const entries = [
    { tag: TAG_ARTIST, ...ascii(ARTIST) },
    { tag: TAG_YCBCR_POSITIONING, ...short(1) },
    { tag: TAG_COPYRIGHT, ...ascii(notice) },
  ];

  const header = 8; // "MM" + 0x002A + offset-to-IFD0
  const ifdSize = 2 + entries.length * 12 + 4; // count + entries + next-IFD pointer
  const dataStart = header + ifdSize;
  const overflow = entries.filter((e) => e.value.length > 4);

  const tiff = Buffer.alloc(
    dataStart + overflow.reduce((n, e) => n + e.value.length, 0)
  );

  tiff.write("MM", 0, "ascii");
  tiff.writeUInt16BE(0x002a, 2);
  tiff.writeUInt32BE(header, 4);
  tiff.writeUInt16BE(entries.length, header);

  let entryAt = header + 2;
  let dataOffset = dataStart;
  for (const entry of entries) {
    // ASCII counts bytes including the NUL; SHORT counts values, not bytes.
    const count = entry.type === TYPE_SHORT ? entry.value.length / 2 : entry.value.length;
    tiff.writeUInt16BE(entry.tag, entryAt);
    tiff.writeUInt16BE(entry.type, entryAt + 2);
    tiff.writeUInt32BE(count, entryAt + 4);
    if (entry.value.length > 4) {
      tiff.writeUInt32BE(dataOffset, entryAt + 8);
      entry.value.copy(tiff, dataOffset);
      dataOffset += entry.value.length;
    } else {
      // Inline, left-aligned in the 4-byte value field.
      entry.value.copy(tiff, entryAt + 8);
    }
    entryAt += 12;
  }
  tiff.writeUInt32BE(0, header + 2 + entries.length * 12); // no IFD1

  return Buffer.concat([Buffer.from(EXIF_ID, "ascii"), tiff]);
}

function buildXmpPayload(notice: string): Buffer {
  const packet =
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
    `  <rdf:Description rdf:about=""\n` +
    `    xmlns:dc="http://purl.org/dc/elements/1.1/"\n` +
    `    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"\n` +
    `    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"\n` +
    `    xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">\n` +
    `   <dc:creator><rdf:Seq><rdf:li>${xmlEscape(ARTIST)}</rdf:li></rdf:Seq></dc:creator>\n` +
    `   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(notice)}</rdf:li></rdf:Alt></dc:rights>\n` +
    `   <photoshop:Credit>${xmlEscape(CREDIT)}</photoshop:Credit>\n` +
    `   <photoshop:Source>${xmlEscape(CREDIT)}</photoshop:Source>\n` +
    `   <xmpRights:Marked>True</xmpRights:Marked>\n` +
    `   <xmpRights:WebStatement>${xmlEscape(SITE)}</xmpRights:WebStatement>\n` +
    `   <xmpRights:UsageTerms><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(USAGE_TERMS)}</rdf:li></rdf:Alt></xmpRights:UsageTerms>\n` +
    `   <Iptc4xmpCore:CreatorContactInfo rdf:parseType="Resource">\n` +
    `    <Iptc4xmpCore:CiUrlWork>${xmlEscape(SITE)}</Iptc4xmpCore:CiUrlWork>\n` +
    `    <Iptc4xmpCore:CiEmailWork>${xmlEscape(EMAIL)}</Iptc4xmpCore:CiEmailWork>\n` +
    `   </Iptc4xmpCore:CreatorContactInfo>\n` +
    `  </rdf:Description>\n` +
    ` </rdf:RDF>\n` +
    `</x:xmpmeta>\n` +
    `<?xpacket end="w"?>`;

  return Buffer.concat([Buffer.from(XMP_ID, "ascii"), Buffer.from(packet, "utf8")]);
}

/** Wrap a payload as an APP1 segment, or null if it can't fit in one. */
function app1(payload: Buffer): Buffer | null {
  const length = payload.length + 2;
  if (length > MAX_SEGMENT) return null;
  const head = Buffer.alloc(4);
  head.writeUInt8(0xff, 0);
  head.writeUInt8(APP1, 1);
  head.writeUInt16BE(length, 2);
  return Buffer.concat([head, payload]);
}

type Segment = { start: number; end: number; marker: number; payload: Buffer };

/**
 * Walk the segments before the scan data. Returns null on anything that isn't
 * a well-formed JPEG — the caller then leaves the file alone.
 */
function readSegments(buf: Buffer): { segments: Segment[]; scanAt: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== SOI) return null;

  const segments: Segment[] = [];
  let at = 2;

  while (at + 4 <= buf.length) {
    if (buf[at] !== 0xff) return null;
    const marker = buf[at + 1];
    if (marker === undefined) return null;
    if (marker === SOS) return { segments, scanAt: at };
    // Standalone markers (no length field): RSTn and a few others.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = buf.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > buf.length) return null;
    segments.push({
      start: at,
      end: at + 2 + length,
      marker,
      payload: buf.subarray(at + 4, at + 2 + length),
    });
    at += 2 + length;
  }
  return null; // ran off the end without reaching the scan
}

const isExif = (s: Segment) =>
  s.marker === APP1 && s.payload.subarray(0, 6).toString("ascii") === EXIF_ID;

const isXmp = (s: Segment) =>
  s.marker === APP1 && s.payload.subarray(0, XMP_ID.length).toString("ascii") === XMP_ID;

/**
 * Return `jpeg` with our EXIF and XMP copyright segments in place.
 *
 * Idempotent: any existing EXIF or XMP is dropped first, so re-running is a
 * replace rather than a pile-up (readers take the first APP1 they find, so
 * appending a second would silently do nothing).
 *
 * Pixels are never touched — this only rewrites the segments ahead of the
 * scan. Anything that isn't a parseable JPEG comes back exactly as it went in.
 */
export function embedCopyright(jpeg: Buffer, now: Date = new Date()): Buffer {
  try {
    const parsed = readSegments(jpeg);
    if (!parsed) return jpeg;

    const notice = copyrightNotice(now);
    const exifSegment = app1(buildExifPayload(notice));
    const xmpSegment = app1(buildXmpPayload(notice));
    if (!exifSegment || !xmpSegment) return jpeg;

    // APP0/JFIF has to stay first if it's there; ours go directly after it.
    const keep = parsed.segments.filter((s) => !isExif(s) && !isXmp(s));
    const jfif = keep.filter((s) => s.marker === APP0);
    const rest = keep.filter((s) => s.marker !== APP0);

    return Buffer.concat([
      jpeg.subarray(0, 2), // SOI
      ...jfif.map((s) => jpeg.subarray(s.start, s.end)),
      exifSegment,
      xmpSegment,
      ...rest.map((s) => jpeg.subarray(s.start, s.end)),
      jpeg.subarray(parsed.scanAt), // SOS onward: the pixels, untouched
    ]);
  } catch {
    return jpeg;
  }
}

/**
 * Return `jpeg` with every metadata segment removed — EXIF, XMP, ICC, IPTC,
 * comments — leaving only what is needed to decode the pixels.
 *
 * For blur placeholders. `sips` copies the source's metadata into the 10px
 * thumbnail it generates, so once the catalogue images carried a copyright
 * notice each placeholder grew from ~860 bytes to ~4400 — and those are
 * base64'd into data/blurs.ts, which ships in the bundle wherever a
 * ProductCard renders. A 10-pixel image does not need a rights statement.
 *
 * It also makes the output depend only on the pixels, so regenerating one
 * blur stops rewriting all of them every time a source file's metadata moves.
 *
 * Anything that isn't a parseable JPEG comes back untouched.
 *
 * So it is not a privacy tool: hand it a PNG or WebP carrying GPS and the GPS
 * survives. It was used for collectors' home photos once and did exactly that.
 * For removing anything sensitive, re-encode instead — see lib/home-photo.ts.
 */
export function stripMetadata(jpeg: Buffer): Buffer {
  try {
    const parsed = readSegments(jpeg);
    if (!parsed) return jpeg;
    // APP0..APP15 (0xE0-0xEF) and COM (0xFE). Everything else — quantisation
    // and Huffman tables, frame headers — is needed to decode the image.
    const isMetadata = (marker: number) =>
      (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    return Buffer.concat([
      jpeg.subarray(0, 2),
      ...parsed.segments
        .filter((s) => !isMetadata(s.marker))
        .map((s) => jpeg.subarray(s.start, s.end)),
      jpeg.subarray(parsed.scanAt),
    ]);
  } catch {
    return jpeg;
  }
}

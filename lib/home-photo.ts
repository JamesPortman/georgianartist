import sharp from "sharp";

/**
 * Prepare a collector's photo of a work in their home for publishing.
 *
 * Re-encoded rather than edited, and that difference is the point. A phone
 * photo carries GPS in its EXIF, and a photo taken in someone's kitchen carries
 * their home address — publish the original file and anyone who saves it can
 * read where the collector lives. The file lands on a public Blob URL, so there
 * is no taking it back afterwards.
 *
 * The browser resize already drops EXIF, so this is the second line, for any
 * file that arrives without going through it. Those are exactly the files that
 * are least likely to be JPEGs, which is why this cannot use stripMetadata():
 * that edits JPEG segments in place and hands anything else back untouched —
 * the right call for a blur placeholder, and a leak here. It did leak, before
 * this existed: a PNG carrying GPS came back byte-for-byte identical.
 *
 * So instead:
 *   - sharp decodes whatever it is given (JPEG, PNG, WebP) and writes a fresh
 *     JPEG, and it carries over no metadata unless asked to. Nothing survives
 *     by being overlooked.
 *   - .rotate() applies the EXIF orientation before the tag goes. Phones store
 *     many photos sideways and flag them upright; drop the flag without
 *     rotating and the collector's wall comes out on its side.
 *   - It fails closed. Anything sharp cannot decode throws, and the upload is
 *     refused rather than published as-is. A collector's photo that fails to
 *     upload is a retry; one that publishes their address is not undoable.
 *
 * No copyright notice either, unlike everything else the admin uploads: the
 * collector took this picture, so naming the artist as rights holder would be
 * a false claim written into the file.
 */
export async function prepareHomePhoto(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().jpeg({ quality: 85 }).toBuffer();
}

import { NextResponse } from "next/server";
import sharp from "sharp";
import { getVisibleWorks, showcaseFor } from "@/lib/showcase";
import {
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_TYPE,
  OG_SOURCE_TIMEOUT_MS,
  OG_CARD_BACKGROUND,
} from "@/lib/og-image";

export const dynamic = "force-dynamic";

/**
 * The site-wide Open Graph image — what a link to the site shows when it's
 * pasted into a message, a post, or a chat.
 *
 * Resolved here rather than named by path in layout.tsx because that path went
 * stale: it pointed at "Singhampton: Winter", which had since been hidden, so
 * every share of the site advertised a painting nobody could buy. Choosing the
 * work at request time keeps the preview honest, and keeps the root layout
 * static (an async generateMetadata there would force every static page to
 * render dynamically just to pick a picture).
 *
 * It used to answer with a 302 to the painting's own file, on the assumption
 * that scrapers follow redirects. Enough of them don't: LinkedIn failed to
 * build a card on the first attempt and succeeded on the second, which is the
 * worst kind of bug — it works when you test it and fails for whoever shared
 * the link. So this serves the bytes itself, resized to the declared
 * dimensions, and the crawler gets one request with no hop and no surprise.
 *
 * When the source can't be fetched or re-encoded, the answer is still an image
 * of the declared size — a plain card on the site's own background. That is a
 * dull preview, and it is deliberately preferred over redirecting to the
 * original file: the original is 2400 wide against a tag claiming 1200, which
 * is the mismatch this route exists to stop making. A redirect survives only
 * for the case where even a blank card can't be encoded, which means sharp
 * itself is unusable and there is nothing left to try.
 */
export async function GET(request: Request) {
  const paintings = await getVisibleWorks("painting");
  const work = showcaseFor(paintings, "site-og") ?? showcaseFor(await getVisibleWorks(), "site-og");

  if (!work) {
    // Nothing visible at all — better no preview than a broken one.
    return new NextResponse(null, { status: 404 });
  }

  // Works are stored either as a repo-relative path or an absolute Blob URL;
  // resolving against the request handles both.
  const source = new URL(work.image, request.url);

  /** Which work the card was built from. The bytes no longer carry a filename,
   *  and "is the preview advertising something still for sale" is the question
   *  this route exists to answer correctly — so the response says. */
  const card = (bytes: Buffer, maxAge: number) =>
    new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": OG_IMAGE_TYPE,
        "Cache-Control": `public, max-age=${maxAge}`,
        "X-Og-Work": work.id,
      },
    });

  try {
    const upstream = await fetch(source, {
      // Without a bound here a stalled source never reaches the catch: the
      // function runs to its platform limit and the crawler is handed a 504,
      // which is worse than the redirect this route replaced.
      signal: AbortSignal.timeout(OG_SOURCE_TIMEOUT_MS),
    });
    if (!upstream.ok) throw new Error(`source image responded ${upstream.status}`);

    const bytes = await sharp(Buffer.from(await upstream.arrayBuffer()))
      // `contain`, not `cover`. Almost nothing in the catalogue is 1.91:1, and
      // cover centre-crops whatever isn't — a share of "Bruce Trail" (1799 x
      // 2400) showed the middle third of it. Letterboxing shows the whole
      // work, which is the call prepareImageForInstagram already makes for
      // exactly this reason.
      .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, {
        fit: "contain",
        background: OG_CARD_BACKGROUND,
      })
      .jpeg({ quality: 82 })
      .toBuffer();

    return card(bytes, 3600);
  } catch (err) {
    // Say so. This route's failures are invisible from inside the site — every
    // page still renders and the build stays green — which is why the header
    // comment above has three paragraphs of history and no logging.
    console.error(`[og-image] could not build a card for "${work.id}":`, err);

    try {
      // Cached briefly, not for an hour: the next scrape should get a real
      // chance at the good path.
      const blank = await sharp({
        create: {
          width: OG_IMAGE_WIDTH,
          height: OG_IMAGE_HEIGHT,
          channels: 3,
          background: OG_CARD_BACKGROUND,
        },
      })
        .jpeg({ quality: 82 })
        .toBuffer();

      return card(blank, 60);
    } catch (blankErr) {
      // sharp itself is unusable. The redirect is wrong about its dimensions,
      // and it is all that is left.
      console.error(`[og-image] could not encode a blank card either:`, blankErr);
      return NextResponse.redirect(source, {
        status: 302,
        headers: { "Cache-Control": "public, max-age=60", "X-Og-Work": work.id },
      });
    }
  }
}

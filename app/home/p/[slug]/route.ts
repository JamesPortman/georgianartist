import { catalogue as cachedCatalogue } from "@/lib/catalogue-cache";
import { legacyOutcome } from "@/lib/legacy-urls";
import { BRAND } from "@/lib/brand";
import { siteConfig } from "@/data/siteConfig";

/**
 * Old Squarespace product URLs: /home/p/<slug>.
 *
 * Still in Google's index and in other people's links: 642 hits across 24
 * paths in three months. A work that is still visible gets a permanent
 * redirect to its page. Anything else gets an honest answer rather than a
 * soft redirect home (see lib/legacy-urls.ts): 410 Gone when nothing in the
 * catalogue matches, so search engines drop the URL, and 404 when it matches a
 * work that is only hidden, since that one may come back.
 *
 * A route handler rather than a page, because a page can only answer 404
 * (notFound()); 410 needs a Response. The body is a small standalone page with
 * no scripts and nothing from the URL in it, so the slug can't be reflected.
 *
 * Reads the live catalogue rather than a hardcoded table, so a work being
 * hidden or deleted changes its answer without anyone updating a list.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const catalogue = await cachedCatalogue.product.findMany({
    select: { id: true, slug: true, title: true, type: true, visible: true },
  });

  const outcome = legacyOutcome(slug, catalogue);
  if (outcome.kind === "redirect") {
    return new Response(null, { status: 308, headers: { Location: outcome.to } });
  }
  const gone = outcome.kind === "gone";
  const status = gone ? 410 : 404;
  return new Response(
    legacyPage(
      status,
      gone ? "This page is gone" : "Page not found",
      gone
        ? "This page was on the old site, and the work it showed is no longer available."
        : "The page you’re looking for isn’t available right now."
    ),
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/** Standalone, script-free; every value in it is a constant, never the URL. */
function legacyPage(status: number, heading: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${heading} | ${siteConfig.brand}</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; color: #1f2937; background: #fff; }
  main { max-width: 36rem; margin: 0 auto; padding: 5rem 1rem; text-align: center; }
  .code { font-size: 3.75rem; font-weight: 300; color: #e5e7eb; margin: 0 0 1.5rem; }
  h1 { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.75rem; }
  p { color: #6b7280; margin: 0 0 2rem; }
  a { display: inline-block; margin: 0.25rem; padding: 0.625rem 1.5rem; border-radius: 0.25rem;
      background: ${BRAND.green}; color: #fff; text-decoration: none; font-weight: 500; }
  a:hover { background: ${BRAND.greenHover}; }
</style>
</head>
<body>
<main>
<p class="code">${status}</p>
<h1>${heading}</h1>
<p>${body}</p>
<a href="/">Paintings</a> <a href="/photographs">Photographs</a>
</main>
</body>
</html>`;
}

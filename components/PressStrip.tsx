import { siteConfig } from "@/data/siteConfig";

/**
 * "As featured in" — a press mention, cited rather than reproduced.
 *
 * The quote is the artist's own writing: the line the publication pulled for
 * the opening of the feature. Nothing from the printed layout appears here.
 * The words and the paintings are his, but the page design belongs to the
 * publisher, so this cites the piece and links to the publication instead of
 * showing it. Keep it that way if the content changes.
 *
 * Renders nothing when `siteConfig.press` is null, which is where a fork with
 * no coverage starts. An empty "As featured in" heading would be worse than
 * no strip at all.
 */
export default function PressStrip({ compact = false }: { compact?: boolean }) {
  const press = siteConfig.press;
  if (!press) return null;

  return (
    <section
      className={`border-t border-gray-200 ${compact ? "pt-8 mt-10" : "pt-12 mt-16"}`}
      aria-label="Press"
    >
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 mb-4">
        As featured in
      </p>
      <figure className="max-w-2xl mx-auto text-center">
        <blockquote
          className={`text-gray-700 italic leading-relaxed ${compact ? "text-base" : "text-lg"}`}
        >
          &ldquo;{press.quote}&rdquo;
        </blockquote>
        <figcaption className="mt-4 text-sm text-gray-500">
          <a
            href={press.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline underline-offset-2 hover:no-underline"
          >
            {press.publication}
          </a>
          , &ldquo;{press.article},&rdquo; {press.date}
        </figcaption>
      </figure>
    </section>
  );
}

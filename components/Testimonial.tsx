import { siteConfig } from "@/data/siteConfig";

/**
 * A collector's words, under the gallery.
 *
 * A component rather than markup inside HomeClient, for the same reason
 * PressStrip is one: it is somebody else's words, it is optional, and a fork
 * needs to remove it by setting `siteConfig.testimonial` to null rather than
 * by deleting JSX out of the middle of the home page.
 *
 * One testimonial, not a list. The layout is a single large centred quote and
 * it does not survive three of them; a site with several wants a different
 * design, not a loop over this one.
 */
export default function Testimonial() {
  const testimonial = siteConfig.testimonial;
  if (!testimonial) return null;

  return (
    <section className="mt-20 border-t border-gray-100 pt-12" aria-label="Testimonial">
      <h2 className="text-center text-sm font-medium text-gray-500 uppercase tracking-wider mb-6">
        What collectors say
      </h2>
      <figure className="max-w-2xl mx-auto text-center">
        <span aria-hidden="true" className="block text-5xl leading-none text-brand/30 font-serif">
          &ldquo;
        </span>
        <blockquote className="text-gray-700 text-lg leading-relaxed italic -mt-3">
          {testimonial.quote}
        </blockquote>
        <figcaption className="mt-5 text-sm font-medium text-brand">
          {testimonial.attribution}
        </figcaption>
      </figure>
    </section>
  );
}

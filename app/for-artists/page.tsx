import type { Metadata } from "next";
import Link from "next/link";
import PressStrip from "@/components/PressStrip";
import { siteConfig } from "@/data/siteConfig";

export const metadata: Metadata = {
  title: `For Artists | ${siteConfig.brand}`,
  description:
    "Tired of renting your gallery from Squarespace or Wix? Have one built once that you own outright (code, images and catalogue) and can move or change whenever you like. The pitch and the honest costs.",
  alternates: { canonical: "/for-artists" },
};

export default function ForArtistsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-800 mb-2">For Artists</h1>
      <p className="text-gray-500 italic text-lg mb-10">
        Own your gallery outright. Nothing rented, nothing locked in.
      </p>

      {/* ── The pitch ───────────────────────────────────────────────── */}
      <div className="prose prose-lg text-gray-700 leading-relaxed space-y-5 max-w-none">
        <p>
          If you&rsquo;re an artist paying Squarespace, Wix, or a similar platform every month
          just to keep your work online, here&rsquo;s another way: have a site built{" "}
          <em>once</em> that you actually own (the code, the images and the catalogue)
          instead of renting one indefinitely.
        </p>
      </div>

      {/* Comparison. Deliberately not a price argument — see "What it actually
          costs" below. The honest numbers are close, and leading with cost
          would be a claim this page cannot back up. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-8">
        <div className="rounded-lg border border-gray-200 p-5 bg-gray-50">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Renting a platform
          </p>
          <p className="text-2xl font-semibold text-gray-800">You never own it</p>
          <p className="text-sm text-gray-500 mt-2">
            CA$21–45 a month, indefinitely, and it goes up. Stop paying and the site goes
            dark: pages, shop and mailing list with it. The cheaper plans also take a
            percentage of every sale. Whatever you build, you build inside someone
            else&rsquo;s product.
          </p>
        </div>
        <div className="rounded-lg border border-brand/30 p-5 bg-brand-tint">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand mb-2">
            A site that belongs to you
          </p>
          <p className="text-2xl font-semibold text-gray-800">You own the asset</p>
          <p className="text-sm text-gray-600 mt-2">
            The code, the images and the catalogue are yours from the first day, and
            exportable whenever you want them. Built once, for a one-time fee, then hosted
            at cost. Nothing is held hostage, and nothing can be discontinued out from
            under you.
          </p>
        </div>
      </div>

      <h2 className="text-xl font-semibold text-gray-800 mt-10 mb-3">What it actually costs</h2>
      <div className="prose prose-lg text-gray-700 leading-relaxed space-y-5 max-w-none">
        <p>
          Plainly: over five years this is not dramatically cheaper than a platform
          subscription. Hosting a site that takes money costs real money (about CA$27 a
          month here), and the build is a one-time fee on top of that. Against a template
          plan, the totals land close to each other.
        </p>
        <p>
          The difference is what you are left holding. After five years of subscription you
          have five years of receipts. Here you have a site you own outright: you can move
          it, hand it to another developer, change anything in it, and keep it running
          without anyone&rsquo;s permission.
        </p>
        <p>
          If the monthly number is the thing that matters most to you, a template plan is a
          sensible choice, and I&rsquo;ll say so on the call rather than talk you out of it.
        </p>
      </div>

      <h2 className="text-xl font-semibold text-gray-800 mt-10 mb-3">Or let me host it</h2>
      <div className="prose prose-lg text-gray-700 leading-relaxed space-y-5 max-w-none">
        <p>
          All of the above assumes you hold the accounts: your hosting, your database, your
          domain. That is the cleanest form of ownership and what I&rsquo;d recommend.
        </p>
        <p>
          If you&rsquo;d rather not manage three logins, I can keep the site on my own account
          for a flat monthly fee we agree on the call. You still own the code, and you can
          take a full export of your catalogue any time you like. Moving onto your own
          accounts later is an afternoon&rsquo;s work, not a renegotiation, which is rather
          the point.
        </p>
      </div>

      <h2 className="text-xl font-semibold text-gray-800 mt-10 mb-3">What you get</h2>
      <ul className="space-y-3 text-gray-700 leading-relaxed">
        <li>
          <strong className="text-gray-800">A real admin area, built for an art practice.</strong>{" "}
          Add, edit, reorder and hide works, upload images, and flag pieces as New or On Sale,
          all without &ldquo;upgrading to the commerce plan.&rdquo; You sign in with a passkey
          (Touch ID or Face ID), not a password that can be guessed or phished.
        </li>
        <li>
          <strong className="text-gray-800">Features shaped around how art is sold and seen.</strong>{" "}
          &ldquo;In a room&rdquo; wall mockups, replaced by a collector&rsquo;s own photo of the
          piece on their wall once one is sent in; a map on every piece showing where it was made,
          and a{" "}
          <Link href="/locations" className="text-brand underline underline-offset-2 hover:no-underline">
            single map of the whole collection
          </Link>
          ; a gift-shop builder (custom calendars, card and postcard packs);{" "}
          <Link href="/making-of" className="text-brand underline underline-offset-2 hover:no-underline">
            &ldquo;making of&rdquo; films
          </Link>{" "}
          on a work&rsquo;s own page, each linked to its spot on the map and back; an archive that keeps sold-out work on the site as
          proof it sells, rather than deleting it; and full search, filter and sort.
        </li>
        <li>
          <strong className="text-gray-800">Instagram, posted for you.</strong>{" "}
          Every piece gets a draft caption written for it and queued up; you read, edit and approve
          them in the admin, and approved posts publish to Instagram on their own schedule. Nothing
          goes out that you haven&rsquo;t signed off on, and if a post ever fails you get an email
          rather than silence.
        </li>
        <li>
          <strong className="text-gray-800">Fast pages, ready for Google.</strong> Image-optimized
          and search-engine-ready out of the box (sitemap, link previews, structured data), plus
          built-in visitor analytics, which can put the work visitors engage with most at the
          front of the gallery.
        </li>
        <li>
          <strong className="text-gray-800">You own the code and the data.</strong> Everything is
          backed up automatically every day and can be exported anytime. No lock-in.
        </li>
      </ul>

      <h2 className="text-xl font-semibold text-gray-800 mt-10 mb-3">The honest part</h2>
      <div className="prose prose-lg text-gray-700 leading-relaxed space-y-5 max-w-none">
        <p>
          This isn&rsquo;t drag-and-drop. It&rsquo;s a real, custom-built website, so changes to the
          design or structure happen in code rather than a visual editor. The day-to-day work of
          adding and managing your art, though, is all done through the simple admin area, no code
          required. It&rsquo;s the right fit if you&rsquo;d rather invest once and own something
          fast and tailored than pay rent forever for a template.
        </p>
      </div>

      <PressStrip compact />

      <div className="rounded-lg bg-brand text-white p-6 my-10 text-center">
        <p className="text-lg font-medium mb-3">Like the idea of a site like this one?</p>
        {/* /book, not /contact: this page's reader is a prospective client, and
            /book asks them the questions worth asking — what they make, where
            they sell now — rather than handing them an empty message box. The
            label matches the page it opens so the click is no surprise. */}
        <Link
          href="/book"
          className="inline-block bg-white text-brand font-semibold px-5 py-2.5 rounded text-sm hover:bg-gray-100 transition-colors"
        >
          Book a free 15-minute chat
        </Link>
        <p className="text-sm text-white/80 mt-3">
          Fifteen minutes, no pitch: what you make, and what a site of your own would
          need to do.
        </p>
      </div>

      <p className="text-gray-600 leading-relaxed">
        Curious how it&rsquo;s built, or want to show your developer?{" "}
        <Link href="/architecture" className="text-brand underline underline-offset-2 hover:no-underline">
          See the architecture
        </Link>
        .
      </p>
    </div>
  );
}

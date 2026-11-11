import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/data/siteConfig";

export const metadata = {
  title: `About | ${siteConfig.brand}`,
  description:
    `${siteConfig.artist} has been painting ${siteConfig.locality} since 2008. Every piece is based on a real place, reproduced as a fine art print.`,
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-semibold text-gray-800 mb-10">About</h1>

      <div className="flex flex-col md:flex-row gap-10 items-start">
        {/* Photo */}
        <div className="w-full md:w-64 shrink-0">
          <div className="relative w-full aspect-square rounded-sm overflow-hidden bg-gray-100">
            <Image
              src="/james.jpg"
              alt={siteConfig.artist}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 256px"
              priority
            />
          </div>
          <p className="text-sm text-gray-500 mt-2 text-center">{siteConfig.artist}</p>
        </div>

        {/* Bio */}
        <div className="prose prose-lg text-gray-700 leading-relaxed space-y-5">
          <p>
            {siteConfig.artist} has been painting since university, where he funded his studies by
            painting murals. He moved to the Blue Mountain area in 2008 and found the Georgian
            Bay landscape immediately, irresistibly compelling.
          </p>
          <p>
            Every piece in this collection is based on a real place: a beach, a river bend,
            a trail he&apos;s walked. The paintings are his way of paying attention. Georgian Bay
            light does things to colour that are hard to explain: the water is never the same
            colour, shifting from jade to slate to the deep blue of open water depending on the
            hour and the season.
          </p>
          <p>
            Each painting starts as an original photograph, which he then paints digitally in
            Rebelle. You can watch that happen on the{" "}
            <Link href="/making-of" className="text-brand underline underline-offset-2 hover:no-underline">
              Making Of
            </Link>{" "}
            page. Each is offered as a limited-edition fine art print. The goal is simple: to put
            a piece of the Bay on your wall that actually feels like being there.
          </p>
          <p>
            His work was featured in{" "}
            <a
              href="https://www.blankspaces.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-2 hover:no-underline"
            >
              Blank Spaces
            </a>{" "}
            magazine in September 2026, a seven-page collection titled
            &ldquo;Reimagining the Bay.&rdquo;
          </p>
          <p>
            Commissions are welcome. If you have a place that matters to you,{" "}
            <Link href="/contact" className="text-brand underline underline-offset-2 hover:no-underline">
              get in touch
            </Link>{" "}
            to discuss.
          </p>
        </div>
      </div>
    </div>
  );
}

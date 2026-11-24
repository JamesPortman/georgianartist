"use client";

import { useState } from "react";
import Image from "next/image";
import MakingOfVideo from "@/components/MakingOfVideo";
import { altOf, captionOf, COMMISSION_KINDS, exampleFilm, KIND_LABEL, type CommissionKind } from "@/lib/commissions";

export type PublicExample = {
  id: string;
  kind: string;
  name: string;
  subject: string | null;
  medium: string | null;
  size: string | null;
  image: string;
  blurDataURL: string | null;
  filmUrl?: string | null;
  filmPosterUrl?: string | null;
};

/** The examples, with a Pets / Portraits switch when there are both. */
export default function CommissionExamples({ examples }: { examples: PublicExample[] }) {
  const kinds = COMMISSION_KINDS.filter((k) => examples.some((e) => e.kind === k));
  const [kind, setKind] = useState<CommissionKind | "all">("all");
  const shown = kind === "all" ? examples : examples.filter((e) => e.kind === kind);

  return (
    <section aria-labelledby="examples-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <h2 id="examples-heading" className="text-2xl font-semibold text-gray-800">
          Past commissions
        </h2>
        {kinds.length > 1 && (
          <div role="group" aria-label="Show" className="flex gap-2">
            {(["all", ...kinds] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  kind === k ? "bg-brand text-white border-brand" : "border-gray-300 text-gray-700 hover:border-brand"
                }`}
              >
                {k === "all" ? "All" : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((e) => {
          const film = exampleFilm(e);
          // An example with a film shows the film: its still is the finished
          // painting, uncropped, so it takes two columns rather than a 4:5 crop.
          return film ? (
          <li key={e.id} className="sm:col-span-2">
            <figure>
              <MakingOfVideo film={film} heading={null} />
              <figcaption className="mt-2 text-sm text-gray-600">
                {captionOf(e)}. Press play to watch it being painted.
              </figcaption>
            </figure>
          </li>
          ) : (
          <li key={e.id}>
            <figure>
              <div className="relative aspect-[4/5] bg-gray-100 rounded-sm overflow-hidden">
                <Image
                  src={e.image}
                  alt={altOf(e)}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  {...(e.blurDataURL ? { placeholder: "blur" as const, blurDataURL: e.blurDataURL } : {})}
                />
              </div>
              <figcaption className="mt-2 text-sm text-gray-600">{captionOf(e)}</figcaption>
            </figure>
          </li>
          );
        })}
      </ul>
    </section>
  );
}

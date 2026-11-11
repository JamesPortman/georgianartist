"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { posterSizeFor } from "@/data/making-of-poster-sizes";

export type MakingOfFilm = {
  id: string;
  title: string;
  videoUrl: string;
  posterUrl: string | null;
  description: string | null;
  seconds: number | null;
  productId: string | null;
};

/**
 * The still behind the play button, through Next's image optimiser.
 *
 * `<video poster>` takes a URL, not a component, so it cannot go through
 * next/image the way the facade does — this builds the optimiser URL by hand.
 * `w` has to be one of `images.deviceSizes` and `q` one of `images.qualities`
 * or the optimiser answers 400; 1080 and 75 are both defaults. The host is
 * allowed by the `*.public.blob.vercel-storage.com` remotePattern in
 * next.config.ts, which is what makes this legal for a Blob URL at all.
 */
function optimisedPoster(url: string) {
  return `/_next/image?url=${encodeURIComponent(url)}&w=1080&q=75`;
}

function runtime(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} seconds`;
}

/**
 * Player for a "making of" film — the painting building up stroke by stroke.
 *
 * Click-to-load. Until the visitor asks for the film, there is no <video> on
 * the page at all — just an optimised still and a play button.
 *
 * It used to render a real <video preload="none"> with `poster` pointing
 * straight at the Blob URL, which was wrong twice over, and both faults landed
 * hardest on /making-of, where all 22 films render at once:
 *
 *   - `poster` is not covered by `preload`. The browser fetches it on load,
 *     always, unoptimised. That was 16.3MB of full-size JPEG per view of
 *     /making-of before anyone pressed anything.
 *   - `preload="none"` is a hint, and Safari in particular treats it as
 *     "metadata". The films' moov atoms sat at the end of the file, so reading
 *     metadata meant reaching the end of a 10–30MB download. Twenty-two of
 *     those per page view is how a 444MB Blob store billed 9.11GB of transfer
 *     in a month.
 *
 * The moov atoms have since been moved to the front (-movflags +faststart), so
 * a film that IS played starts on a small read instead of a large one. This
 * component is the other half: nothing is read until it is asked for.
 *
 * The facade is an <a> to the file rather than a <button> so that it still does
 * something useful with JavaScript off — it downloads the film, which is what
 * the old markup's fallback link offered.
 */
export default function MakingOfVideo({
  film,
  heading = "How it was made",
  headingLevel = "h2",
}: {
  film: MakingOfFilm;
  /** Section heading. Pass null to render the player on its own. */
  heading?: string | null;
  headingLevel?: "h2" | "h3";
}) {
  const [playing, setPlaying] = useState(false);
  const Heading = headingLevel;
  const length = runtime(film.seconds);

  const { width, height } = posterSizeFor(film.id);

  return (
    <section>
      {heading && (
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <Heading className="text-sm font-medium text-gray-700">{heading}</Heading>
          {length && <span className="text-xs text-gray-500">{length}</span>}
        </div>
      )}

      <div className="w-full max-w-3xl">
        {playing ? (
          <video
            autoPlay
            controls
            playsInline
            poster={film.posterUrl ? optimisedPoster(film.posterUrl) : undefined}
            className="w-full rounded-sm border border-gray-200 bg-gray-900"
          >
            <source src={film.videoUrl} type="video/mp4" />
            Your browser can&rsquo;t play this video.{" "}
            <a href={film.videoUrl} className="text-brand underline">
              Download it instead
            </a>
            .
          </video>
        ) : (
          <a
            href={film.videoUrl}
            onClick={(e) => {
              // Left click only — let ⌘/ctrl-click and middle click still reach
              // the file, the way any other link to a download would.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setPlaying(true);
            }}
            aria-label={`Play the film of ${film.title}`}
            className="group relative block w-full overflow-hidden rounded-sm border border-gray-200 bg-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {film.posterUrl ? (
              <Image
                src={film.posterUrl}
                alt=""
                width={width}
                height={height}
                sizes="(max-width: 768px) 100vw, 768px"
                className="w-full h-auto transition-opacity group-hover:opacity-85"
              />
            ) : (
              <div
                style={{ aspectRatio: `${width} / ${height}` }}
                className="w-full flex items-center justify-center text-xs text-gray-500"
              >
                No still yet
              </div>
            )}

            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm transition-colors group-hover:bg-black/70">
                <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-[2px] fill-white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </span>
          </a>
        )}
      </div>

      {film.description && (
        <p className="text-sm text-gray-600 leading-relaxed mt-3">{film.description}</p>
      )}

      {film.productId && (
        <p className="text-xs text-gray-500 mt-2">
          <Link href={`/making-of`} className="text-brand hover:underline font-medium">
            See all the films →
          </Link>
        </p>
      )}
    </section>
  );
}

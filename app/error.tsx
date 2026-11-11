"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/components/ClientErrorReporter";

/**
 * What a visitor sees when a page throws while rendering — most likely the
 * database not answering, since every page reads it. Without this file Next
 * shows its own unstyled error screen. The error itself has already been
 * reported to the owner by instrumentation.ts, unless it was thrown here in the
 * browser, which only this page sees; it reports those itself.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error, "browser (page)"), [error]);
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-6xl font-light text-gray-200 mb-6" aria-hidden="true">
        ⚠
      </p>
      <h1 className="text-2xl font-semibold text-gray-800 mb-3">Something went wrong</h1>
      <p className="text-gray-600 mb-8">
        This page couldn&rsquo;t be shown just now. It&rsquo;s usually over in a moment. Please
        try again.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-block bg-brand hover:bg-brand-hover text-white font-medium py-2.5 px-6 rounded transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-block border border-gray-300 hover:border-brand text-gray-700 font-medium py-2.5 px-6 rounded transition-colors"
        >
          Back to gallery
        </Link>
      </div>
    </div>
  );
}

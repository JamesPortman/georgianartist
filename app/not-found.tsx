import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundBeacon } from "@/components/AnalyticsTracker";
import { siteConfig } from "@/data/siteConfig";

export const metadata: Metadata = {
  title: `Page Not Found | ${siteConfig.brand}`,
};

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      {/* Keeps this failed request out of the pageview counts. */}
      <NotFoundBeacon />
      <p className="text-6xl font-light text-gray-200 mb-6">404</p>
      <h1 className="text-2xl font-semibold text-gray-800 mb-3">
        Page not found
      </h1>
      <p className="text-gray-500 mb-8">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="inline-block bg-brand hover:bg-brand-hover text-white font-medium py-2.5 px-6 rounded transition-colors"
      >
        Back to gallery
      </Link>
    </div>
  );
}

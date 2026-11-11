"use client";

import { track } from "@/components/AnalyticsTracker";
import { siteConfig } from "@/data/siteConfig";

/**
 * What a sold-out work's page offers instead of a purchase.
 *
 * The page stays up rather than 404ing: it holds its search ranking, its
 * inbound links, and the record that the work existed. But everything that
 * looked like an offer — the size list, the prices, Buy Now, the cards — is
 * gone, because a page that lists prices for something nobody can order is
 * worse than no page at all.
 *
 * That leaves a visitor who wanted this exact piece with nowhere to go, which
 * is the whole reason for the enquiry link. It is the only reason keeping
 * these pages alive pays for itself, so the click is tracked: if the archive
 * never produces an enquiry, that is worth knowing.
 */
export default function SoldOutPanel({
  title,
  productId,
}: {
  title: string;
  productId: string;
}) {
  const subject = `Something similar to "${title}"`;
  const body =
    `Hi James,\n\n` +
    `I came across "${title}" on the site and see the edition has sold out. ` +
    `Is anything similar available?\n\n`;
  const href =
    `mailto:${siteConfig.contact.email}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="mb-6">
      <div className="border border-gray-200 rounded p-4 bg-gray-50">
        <p className="text-sm font-semibold text-gray-800 mb-1">This edition is sold out</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Every print in this limited edition has found a home, and it won&rsquo;t be
          reprinted. Other work from the same series is often available, and commissions
          are open.
        </p>
        <a
          href={href}
          onClick={() => track("soldout_enquiry", { productId })}
          className="inline-block mt-3 bg-brand text-white text-sm font-medium px-4 py-2.5 rounded hover:bg-brand-hover transition-colors"
        >
          Ask about something similar
        </a>
      </div>
    </div>
  );
}

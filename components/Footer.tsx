/**
 * The account is the one the posting cron publishes to (see the Instagram
 * section of CLAUDE.md). Keep the handle here in sync with
 * IG_BUSINESS_ACCOUNT_ID's account if it ever changes — a footer on every page
 * pointing at the wrong handle is a quiet, site-wide error.
 */
import Link from "next/link";
import { siteConfig } from "@/data/siteConfig";
import { RIGHTS_HOLDER, START_YEAR } from "@/lib/copyright";
export const INSTAGRAM_HANDLE = siteConfig.social.instagram;
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;

// Pages kept out of the header menu so it stays short
// (components/Navigation.tsx). Architecture is the pitch to engineers, reached
// from For Artists too; a fork deletes it.
export const FOOTER_LINKS = [{ href: "/architecture", label: "Architecture" }];

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 mt-16 py-6 px-4 text-center text-sm text-gray-500 bg-white">
      <nav aria-label="More" className="mb-3 flex justify-center gap-x-6 gap-y-1 flex-wrap">
        {FOOTER_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-gray-600 hover:text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mb-2">
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="me noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-gray-600 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="w-4 h-4 fill-current shrink-0"
          >
            <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23-.06-1.27-.07-1.65-.07-4.85s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38C1.35 2.68.93 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13.67.66 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.72 2.13-1.38.66-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.72-1.46-1.38-2.13C21.32 1.35 20.65.93 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0Z" />
            <path d="M12 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z" />
            <circle cx="18.41" cy="5.59" r="1.44" />
          </svg>
          <span>
            Follow the work on Instagram: <span className="font-medium">@{INSTAGRAM_HANDLE}</span>
          </span>
        </a>
      </p>
      {/* The same holder and start year the embed-copyright script writes into
          the image files. Read from lib/copyright.ts rather than repeated here,
          which is what the docs always claimed and the markup never did. */}
      <p>
        All images Copyright {START_YEAR}–{new Date().getFullYear()} {RIGHTS_HOLDER}
      </p>
    </footer>
  );
}

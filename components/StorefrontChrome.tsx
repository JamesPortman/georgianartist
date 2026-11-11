"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps the storefront header/footer so they're hidden where a page brings its
 * own chrome.
 *
 * /admin has its own; showing the public nav, sale banner and footer there
 * caused overlapping headers and broke the sticky offsets.
 *
 * /book is a standalone landing page for the printed flier, with its own
 * masthead and an entirely different palette. The sale banner and newsletter
 * would both undercut a page whose whole job is one call to action.
 *
 * /architecture keeps the storefront's nav and footer but not the sale banner:
 * it's a technical write-up for engineers, and "save up to 35% on prints"
 * above it reads as noise.
 */

/** Pages (and everything under them) that keep the nav but not the sale banner. */
export const NO_SALE_BANNER = ["/architecture"];

const under = (pathname: string | null, prefix: string) =>
  pathname === prefix || !!pathname?.startsWith(`${prefix}/`);

export default function StorefrontChrome({
  banner,
  header,
  footer,
  children,
}: {
  banner: React.ReactNode;
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Pages that supply their own header and footer.
  const standalone = under(pathname, "/admin") || under(pathname, "/book");
  const noBanner = standalone || NO_SALE_BANNER.some((p) => under(pathname, p));

  return (
    <>
      {!noBanner && banner}
      {!standalone && header}
      {/* The skip link's target (app/layout.tsx); focusable only from it.
          At least a screen tall: a page streams in after the shell, so without
          this the footer is painted just under the header and then shoved down
          when the page arrives: a layout shift of 0.70 on the gallery and the
          photographs (Lighthouse CI, perf.yml). Below the fold, it moves unseen. */}
      <main id="main-content" tabIndex={-1} className="flex-1 min-h-screen focus:outline-none">
        {children}
      </main>
      {!standalone && footer}
    </>
  );
}

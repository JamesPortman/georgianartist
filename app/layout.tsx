import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import Navigation from "@/components/Navigation";
import SaleBanner from "@/components/SaleBanner";
import Footer from "@/components/Footer";
import Newsletter from "@/components/Newsletter";
import StorefrontChrome from "@/components/StorefrontChrome";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import ClientErrorReporter from "@/components/ClientErrorReporter";
import { siteConfig } from "@/data/siteConfig";
import { OG_IMAGE_PATH, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from "@/lib/og-image";
import { gaMeasurementId, GA_CONSENT_DEFAULTS } from "@/lib/ga";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: `${siteConfig.brand}`,
  description: "Original canvas paintings and photographs of Georgian Bay and the surrounding Ontario region.",
  openGraph: {
    // Resolved at request time to a painting that is actually for sale. This
    // used to name an image by path, and that painting was later hidden — so
    // every share of the site advertised work nobody could buy.
    images: [
      { url: OG_IMAGE_PATH, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: `${siteConfig.brand}` },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set per request by proxy.ts; the GA4 scripts need it under the CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const gaId = gaMeasurementId();
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#fafafa]">
        {/* The first thing a keyboard reaches: past the logo and the seven menu
            links to the page itself. Hidden until focused. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-brand focus:shadow focus:outline-2 focus:outline-brand"
        >
          Skip to content
        </a>
        <StorefrontChrome
          banner={<SaleBanner />}
          header={<Navigation />}
          footer={
            <>
              <Newsletter />
              <Footer />
            </>
          }
        >
          {children}
        </StorefrontChrome>
        <AnalyticsTracker />
        <ClientErrorReporter />
        {/* Production only, and advertising off — see lib/ga.ts. Also skipped
            when no measurement id is configured, so a fork doesn't ship tags
            pointing at an empty property. Consent defaults come first in the
            queue, before config, so no hit is ever sent with ad storage on. */}
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
              nonce={nonce}
            />
            <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'default', ${JSON.stringify(GA_CONSENT_DEFAULTS)});
                gtag('js', new Date());
                gtag('config', '${gaId}', {
                  allow_google_signals: false,
                  allow_ad_personalization_signals: false
                });
              `}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}

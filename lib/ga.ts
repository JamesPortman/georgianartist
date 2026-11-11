import { siteConfig } from "@/data/siteConfig";

/**
 * Google Analytics 4 — whether to load it, and how.
 *
 * Only the production deployment reports to GA. CI's Playwright runs load
 * real pages in a real browser, and with the tag always on they showed up in
 * GA as thousands of "users" from Azure data-centre towns (Flint Hill,
 * Des Moines, Moses Lake, Chicago), swamping the real audience. Local builds
 * and dev would do the same on a smaller scale. The first-party tracker has
 * its own host filter; GA doesn't, so the tag simply isn't rendered.
 */
export function gaMeasurementId(env: Record<string, string | undefined> = process.env): string | null {
  return env.VERCEL_ENV === "production" && siteConfig.analytics.ga4 ? siteConfig.analytics.ga4 : null;
}

/**
 * Consent-mode defaults: analytics on, advertising off. The site runs no ads,
 * and with ad storage allowed GA sends a remarketing ping to
 * www.google.<visitor's country>/ads/ga-audiences — one domain per country,
 * which no Content-Security-Policy can list (reports have come in for .ca,
 * .com.mx and .nl). Turning Google Signals off, in the property and in the
 * config call, did not stop it; denying ad storage is the switch that does.
 */
export const GA_CONSENT_DEFAULTS = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "granted",
} as const;

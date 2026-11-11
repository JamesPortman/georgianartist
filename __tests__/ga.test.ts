import { describe, it, expect } from "vitest";
import { gaMeasurementId, GA_CONSENT_DEFAULTS } from "../lib/ga";
import { siteConfig } from "../data/siteConfig";

describe("Google Analytics", () => {
  it("loads only on the production deployment", () => {
    expect(gaMeasurementId({ VERCEL_ENV: "production" })).toBe(siteConfig.analytics.ga4);
    // CI, local builds and dev: no VERCEL_ENV. Their browsers counted as
    // thousands of GA "users" from data-centre towns before this.
    expect(gaMeasurementId({})).toBeNull();
    expect(gaMeasurementId({ VERCEL_ENV: "preview" })).toBeNull();
    expect(gaMeasurementId({ VERCEL_ENV: "development" })).toBeNull();
  });

  it("keeps analytics and turns advertising off", () => {
    expect(GA_CONSENT_DEFAULTS).toEqual({
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "granted",
    });
  });
});

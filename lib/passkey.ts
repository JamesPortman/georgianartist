import { siteConfig } from "@/data/siteConfig";

/**
 * Passkeys for the admin login.
 *
 * The admin is one person, so there is no username: every passkey belongs to
 * "the admin", and signing in asks the browser for any passkey it holds for
 * this site (a discoverable credential). Once at least one passkey exists the
 * password stops working — a passkey unlocked with Touch ID or Face ID is
 * already two factors (the device and the person), and it can't be phished.
 *
 * The break-glass, for when every device is lost: set ADMIN_PASSWORD_LOGIN=1
 * in Vercel. That needs the owner's Vercel account, which is the thing that
 * already holds every secret; it re-enables the password until a new passkey
 * is registered and the variable is removed.
 */

/** How long a sign-in or registration ceremony may take. */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** A fixed user handle: there is one admin, so there is one user. */
export const ADMIN_USER_ID = new TextEncoder().encode("georgianartist-admin");

export type RelyingParty = { rpID: string; origin: string };

/**
 * The relying party for the host this request arrived on.
 *
 * The rpID is the registrable domain (georgianartist.com), so a passkey made
 * on www. also works on the bare domain. Locally and in CI it is localhost,
 * which browsers treat as a secure context over plain http. Any other host —
 * a preview URL, another subdomain, something spoofing the Host header — gets null, and the
 * ceremony is refused rather than bound to the wrong site.
 */
export function relyingParty(host: string | null | undefined, siteUrl: string = siteConfig.url): RelyingParty | null {
  const h = (host ?? "").trim().toLowerCase();
  const hostname = h.replace(/:\d+$/, "");
  const site = new URL(siteUrl).hostname.replace(/^www\./, "");
  // The site itself, nothing else: any subdomain could use the rpID too, so
  // a taken-over subdomain (a dangling DNS record) could host a phishing page
  // and relay what it collects (security review, October 2026).
  if (hostname === site || hostname === `www.${site}`) {
    return { rpID: site, origin: `https://${h}` };
  }
  if (hostname === "localhost") {
    return { rpID: "localhost", origin: `http://${h}` };
  }
  return null;
}

/** Whether the password may be used to sign in. */
export function passwordLoginAllowed(
  passkeyCount: number,
  env: Record<string, string | undefined> = process.env
): boolean {
  return passkeyCount === 0 || env.ADMIN_PASSWORD_LOGIN === "1";
}

/** Whether a stored challenge is still usable. */
export function challengeIsFresh(issuedAt: number | undefined, now: number = Date.now()): boolean {
  return typeof issuedAt === "number" && now - issuedAt >= 0 && now - issuedAt < PASSKEY_CHALLENGE_TTL_MS;
}

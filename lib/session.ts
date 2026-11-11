import type { SessionOptions } from "iron-session";

export interface SessionData {
  isLoggedIn: boolean;
  /** The WebAuthn challenge in flight (lib/passkey.ts), single use. */
  passkeyChallenge?: string;
  /** When it was issued, ms since epoch; stale after PASSKEY_CHALLENGE_TTL_MS. */
  passkeyChallengeAt?: number;
}

/** Eight hours: an admin session, start to finish. */
export const SESSION_TTL_SEC = 60 * 60 * 8;

export const sessionOptions: SessionOptions = {
  cookieName: "admin_session",
  // SESSION_SECRET must be at least 32 characters — used to encrypt the cookie.
  // Generate one with: openssl rand -hex 32
  password: process.env.SESSION_SECRET as string,
  // How long the sealed cookie is accepted, server side. iron-session's
  // default is 14 days, whatever the cookie's own maxAge says, so a copied
  // cookie used to keep working for two weeks after the browser had dropped
  // it (security review, October 2026). With ttl set, iron-session derives
  // the cookie's maxAge from it.
  ttl: SESSION_TTL_SEC,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export async function getAdminSession() {
  const { getIronSession } = await import("iron-session");
  const { cookies } = await import("next/headers");
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

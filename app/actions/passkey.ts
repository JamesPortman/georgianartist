"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/session";
import { clientIp } from "@/lib/client-ip";
import { clearFailures, isRateLimited, loginKey, recordFailure } from "@/lib/rate-limit";
import { ADMIN_USER_ID, challengeIsFresh, relyingParty } from "@/lib/passkey";
import { siteConfig } from "@/data/siteConfig";
import { requireAuth } from "@/app/actions/admin";

/**
 * Passkey ceremonies for the admin (lib/passkey.ts explains the model).
 *
 * Each ceremony is two calls: the server issues options with a random
 * challenge, kept in the encrypted session cookie; the browser has the
 * authenticator sign it; the server verifies the answer against that
 * challenge, once. Failures count against the same Postgres lockout as the
 * password did (lib/rate-limit.ts).
 */

type Err = { error: string };

async function rp() {
  const h = await headers();
  return relyingParty(h.get("x-forwarded-host") ?? h.get("host"));
}

// ── Sign in ───────────────────────────────────────────────────────────────────

export async function passkeyLoginOptionsAction(): Promise<{ options: PublicKeyCredentialRequestOptionsJSON } | Err> {
  const party = await rp();
  if (!party) return { error: "Passkeys can't be used on this address." };

  const limited = await isRateLimited(loginKey(await clientIp()));
  if (limited.blocked) {
    const mins = Math.max(1, Math.ceil(limited.retryAfterSec / 60));
    return { error: `Too many attempts. Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.` };
  }

  // No allowCredentials: the browser offers whichever passkey it holds for
  // this site, so the page never has to say which ones exist.
  const options = await generateAuthenticationOptions({ rpID: party.rpID, userVerification: "required" });
  const session = await getAdminSession();
  session.passkeyChallenge = options.challenge;
  session.passkeyChallengeAt = Date.now();
  await session.save();
  return { options };
}

export async function passkeyLoginVerifyAction(response: AuthenticationResponseJSON): Promise<{ ok: true } | Err> {
  const party = await rp();
  if (!party) return { error: "Passkeys can't be used on this address." };
  const key = loginKey(await clientIp());

  const session = await getAdminSession();
  const challenge = session.passkeyChallenge;
  const fresh = challengeIsFresh(session.passkeyChallengeAt);
  // Single use, whatever happens next.
  session.passkeyChallenge = undefined;
  session.passkeyChallengeAt = undefined;
  await session.save();
  if (!challenge || !fresh) return { error: "That took too long. Please try again." };

  const stored = await prisma.adminPasskey.findUnique({ where: { id: String(response?.id ?? "") } });
  if (!stored) {
    await recordFailure(key);
    return { error: "That passkey isn't registered for this admin." };
  }

  let verified = false;
  let newCounter = stored.counter;
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: party.origin,
      expectedRPID: party.rpID,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports ? stored.transports.split(",") : undefined,
      },
    });
    verified = result.verified;
    newCounter = result.authenticationInfo.newCounter;
  } catch {
    verified = false;
  }
  if (!verified) {
    await recordFailure(key);
    return { error: "The passkey couldn't be verified." };
  }

  await prisma.adminPasskey.update({
    where: { id: stored.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });
  await clearFailures(key);
  session.isLoggedIn = true;
  await session.save();
  return { ok: true };
}

// ── Register (signed in) ─────────────────────────────────────────────────────

export async function passkeyRegisterOptionsAction(): Promise<{ options: PublicKeyCredentialCreationOptionsJSON } | Err> {
  await requireAuth();
  const party = await rp();
  if (!party) return { error: "Passkeys can't be registered on this address." };

  const existing = await prisma.adminPasskey.findMany({ select: { id: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: siteConfig.brand,
    rpID: party.rpID,
    userName: "admin",
    userDisplayName: `${siteConfig.brand} admin`,
    userID: ADMIN_USER_ID,
    attestationType: "none",
    // The same authenticator can't be registered twice.
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports ? c.transports.split(",") : undefined,
    })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const session = await getAdminSession();
  session.passkeyChallenge = options.challenge;
  session.passkeyChallengeAt = Date.now();
  await session.save();
  return { options };
}

export async function passkeyRegisterVerifyAction(
  response: RegistrationResponseJSON,
  label: string
): Promise<{ ok: true } | Err> {
  await requireAuth();
  const party = await rp();
  if (!party) return { error: "Passkeys can't be registered on this address." };

  const session = await getAdminSession();
  const challenge = session.passkeyChallenge;
  const fresh = challengeIsFresh(session.passkeyChallengeAt);
  session.passkeyChallenge = undefined;
  session.passkeyChallengeAt = undefined;
  await session.save();
  if (!challenge || !fresh) return { error: "That took too long. Please try again." };

  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: party.origin,
      expectedRPID: party.rpID,
      requireUserVerification: true,
    });
    if (!verified || !registrationInfo) return { error: "The passkey couldn't be verified." };
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
    await prisma.adminPasskey.create({
      data: {
        id: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports?.join(",") || null,
        label: (label || "Passkey").trim().slice(0, 60),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      },
    });
  } catch {
    return { error: "The passkey couldn't be registered." };
  }
  revalidatePath("/admin/security");
  return { ok: true };
}

// ── Remove (signed in) ───────────────────────────────────────────────────────

export async function deletePasskeyAction(id: string): Promise<void> {
  await requireAuth();
  await prisma.adminPasskey.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/admin/security");
}

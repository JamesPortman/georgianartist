// Server-side email validation: structure, disposable-domain blocklist,
// and live MX record lookup.

import { promises as dns } from "dns";
import disposableDomains from "disposable-email-domains";

const disposableSet = new Set(disposableDomains as string[]);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function validateEmail(email: string): Promise<EmailValidationResult> {
  if (!email || typeof email !== "string") {
    return { ok: false, reason: "Email is required." };
  }
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) {
    return { ok: false, reason: "Email address looks invalid. Please check and try again." };
  }

  const domain = trimmed.split("@")[1];
  if (!domain) {
    return { ok: false, reason: "Email address looks invalid. Please check and try again." };
  }

  // Disposable / throwaway address blocklist
  if (disposableSet.has(domain)) {
    return { ok: false, reason: "Please use a permanent email address." };
  }

  // Gmail dot-abuse: Gmail ignores dots in the local part, so spammers
  // multiplex one inbox through many "dotted" variants. 4+ dots is almost
  // never a real human pattern (`john.smith.jr@gmail.com` has 2).
  if ((domain === "gmail.com" || domain === "googlemail.com")) {
    const local = trimmed.split("@")[0] ?? "";
    const dotCount = (local.match(/\./g) || []).length;
    if (dotCount >= 4) {
      return { ok: false, reason: "Email address looks invalid. Please check and try again." };
    }
  }

  // Live MX lookup — verifies the domain actually accepts mail
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) {
      return { ok: false, reason: "Email address looks invalid. Please check and try again." };
    }
  } catch {
    return { ok: false, reason: "Email address looks invalid. Please check and try again." };
  }

  return { ok: true };
}

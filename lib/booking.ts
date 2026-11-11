/**
 * Booking form logic, kept out of the route so it can be tested directly.
 *
 * The email body's shape is a specification, not a preference — the handoff
 * pins the subject line, the field order, and the blank line before the notes,
 * because that is what James reads on a phone between market stalls.
 */

export interface BookingFields {
  name: string;
  email: string;
  phone: string;
  medium: string;
  town: string;
  current: string;
  notes: string;
}

/**
 * The exact body the handoff specifies. Empty optional fields keep their line
 * rather than collapsing: a consistent shape is quicker to scan than a compact
 * one, and a missing "Phone:" line reads as a bug rather than a blank answer.
 */
export function formatBookingEmail(f: BookingFields): string {
  return [
    `Name: ${f.name}`,
    `Email: ${f.email}`,
    `Phone: ${f.phone}`,
    `What they make: ${f.medium}`,
    `Town: ${f.town}`,
    `Where they are now: ${f.current}`,
    "",
    "Notes:",
    f.notes,
  ].join("\n");
}

/**
 * A human takes longer than this to fill in six fields. Generous on purpose:
 * the cost of being wrong is a lost enquiry from someone who types fast or
 * autofills, which is far worse than one spam email getting through.
 */
export const MIN_SUBMIT_MS = 2_000;

export type SpamCheck = { ok: true } | { ok: false; reason: "honeypot" | "too-fast" };

/**
 * Invisible spam checks — honeypot and time-to-submit, no CAPTCHA.
 *
 * A missing or unparseable `elapsedMs` passes. It comes from the client and a
 * blocked timer, a restored tab or an odd browser could all lose it; refusing
 * an enquiry because a number was absent would trade a real lead for nothing.
 */
export function checkBookingSubmission(input: {
  website?: unknown;
  elapsedMs?: unknown;
}): SpamCheck {
  if (typeof input.website === "string" && input.website.trim() !== "") {
    return { ok: false, reason: "honeypot" };
  }
  const elapsed = typeof input.elapsedMs === "number" ? input.elapsedMs : null;
  if (elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_SUBMIT_MS) {
    return { ok: false, reason: "too-fast" };
  }
  return { ok: true };
}

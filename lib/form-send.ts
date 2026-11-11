/**
 * Send a form's two emails, and find out whether they went.
 *
 * Resend's `emails.send()` does not throw when an email is refused: it
 * resolves to `{ data: null, error }`. The three form routes used to
 * `await Promise.all(sends)` and answer `{ ok: true }` either way, so a
 * refused email looked exactly like a delivered one -- to the visitor, to the
 * owner, and to the analytics, which counted it as sent.
 *
 * The owner's copy is the enquiry itself. It goes first; if it fails, the
 * submission has failed and the route must say so (OwnerEmailFailed), so the
 * visitor can retry or use the phone and email fallbacks -- and no
 * confirmation goes out promising a reply to a message nobody received. A
 * failed confirmation is only logged: the owner already has the message.
 *
 * Past the daily limit on owner emails (lib/form-rate-limit.ts) nothing is
 * sent and the submission fails the same way, with the same fallbacks.
 */

import { allowOwnerEmail } from "@/lib/form-rate-limit";

type SendResult = { error?: { message?: string; name?: string } | null } | null | undefined;

export class OwnerEmailFailed extends Error {
  constructor(reason: string) {
    super(`Owner email not sent: ${reason}`);
    this.name = "OwnerEmailFailed";
  }
}

function failure(r: PromiseSettledResult<SendResult>): string | null {
  if (r.status === "rejected") return String(r.reason);
  const e = r.value?.error;
  return e ? `${e.name ?? "error"}: ${e.message ?? ""}` : null;
}

export async function sendForm(
  form: string,
  owner: () => Promise<SendResult>,
  confirmation: (() => Promise<SendResult>) | null
): Promise<void> {
  if (!(await allowOwnerEmail(form))) throw new OwnerEmailFailed(`${form}: daily limit on owner emails reached`);
  const [ownerResult] = await Promise.allSettled([owner()]);
  const ownerFailed = failure(ownerResult);
  if (ownerFailed) throw new OwnerEmailFailed(`${form}: ${ownerFailed}`);

  if (!confirmation) return;
  const [confirmResult] = await Promise.allSettled([confirmation()]);
  const confirmFailed = failure(confirmResult);
  // Never the address itself: these logs are not a place for visitor data.
  if (confirmFailed) console.error(`[${form}] confirmation email not sent: ${confirmFailed}`);
}

import { Resend } from "resend";
import { NextResponse } from "next/server";
import { validateEmail } from "@/lib/email-validation";
import { validateName } from "@/lib/name-validation";
import { formatBookingEmail, checkBookingSubmission } from "@/lib/booking";
import { allowConfirmation, allowSubmission, TOO_MANY } from "@/lib/form-rate-limit";
import { checkFields, readFormBody } from "@/lib/form-input";
import { mailFrom, siteConfig } from "@/data/siteConfig";
import { OwnerEmailFailed, sendForm } from "@/lib/form-send";
import { recordServerAction } from "@/lib/server-event";
import { subjectLine } from "@/lib/email-subject";

/**
 * Booking requests from /book.
 *
 * The design prototype submitted via `mailto:`, which the handoff calls out as
 * unacceptable: it opens the *visitor's* mail client, and on a phone at a
 * farmer's market — exactly where the flier gets picked up — there often isn't
 * one configured. The lead vanishes with nothing to show for it. So this posts
 * server-side and mails James directly.
 *
 * Spam protection is deliberately invisible, per the handoff: a honeypot plus a
 * time-to-submit check, no CAPTCHA. Both fail *silently* — a caught bot gets a
 * cheerful 200 and no email, because telling a bot it was detected only teaches
 * whoever wrote it.
 */
export async function POST(request: Request) {
  try {
    const parsed = await readFormBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.body;

    const { name, email, phone, medium, town, current, notes, website, elapsedMs } =
      body as Record<string, unknown>;

    // Honeypot + time-to-submit. Looks like success, sends nothing.
    if (!checkBookingSubmission({ website, elapsedMs }).ok) {
      // Counted against the same per-IP limit first, so a bot can't write
      // analytics rows without end (security review, October 2026).
      if (await allowSubmission("book")) await recordServerAction("spam_blocked", request, "/book");
      return NextResponse.json({ ok: true });
    }

    if (!(await allowSubmission("book"))) {
      return NextResponse.json(TOO_MANY, { status: 429 });
    }

    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

    // Only name and email are required — the rest of the form is there to make
    // the reply useful, not to gate the enquiry.
    if (!str(name) || !str(email)) {
      return NextResponse.json(
        { error: "Your name and email are needed so I can reply." },
        { status: 400 }
      );
    }

    const tooLong = checkFields(body, ["name", "email", "phone", "medium", "town", "current", "notes"]);
    if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

    const nameCheck = validateName(str(name));
    if (!nameCheck.ok) {
      return NextResponse.json({ error: nameCheck.reason }, { status: 400 });
    }

    const emailCheck = await validateEmail(str(email));
    if (!emailCheck.ok) {
      return NextResponse.json({ error: emailCheck.reason }, { status: 400 });
    }

    const fields = {
      name: str(name),
      email: str(email),
      phone: str(phone),
      medium: str(medium),
      town: str(town),
      current: str(current),
      notes: str(notes),
    };

    const resend = new Resend(process.env.RESEND_API_KEY);

    await sendForm(
      "book",
      () =>
        resend.emails.send({
          from: mailFrom(),
          to: siteConfig.contact.ownerEmail,
          // So a reply from the inbox goes straight back to them.
          replyTo: fields.email,
          subject: subjectLine(`Booking request: ${fields.name}`),
          text: formatBookingEmail(fields),
        }),
      // The autoresponder goes to an address the visitor chose, from this
      // domain, so it repeats nothing they typed and is rate-limited
      // (lib/form-rate-limit.ts).
      (await allowConfirmation(fields.email))
        ? () =>
            resend.emails.send({
              from: mailFrom(),
              to: fields.email,
              // This message says "I'll reply within a day", which invites an answer
              // — "Tuesday suits better". Without this, that answer goes to
              // noreply@georgianartist.com and is never seen. A lead lost after it
              // was already won is the failure this whole form exists to avoid.
              replyTo: siteConfig.contact.ownerEmail,
              subject: "Thanks, I'll be in touch",
              text:
                `Hello,\n\n` +
                `Thanks for getting in touch about a website. I'll reply within a day with a ` +
                `couple of times that suit for a fifteen-minute chat.\n\n` +
                `In a hurry? Text ${siteConfig.contact.phone}.\n\n` +
                `${siteConfig.artist}\n${new URL(siteConfig.url).host}`,
            })
        : null
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OwnerEmailFailed) console.error(e.message);
    // Never dead-end the visitor: the page repeats the phone and email
    // fallbacks alongside this.
    return NextResponse.json(
      { error: "That didn't send." },
      { status: 500 }
    );
  }
}

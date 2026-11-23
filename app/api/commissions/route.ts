import { Resend } from "resend";
import { NextResponse } from "next/server";
import { validateEmail } from "@/lib/email-validation";
import { validateName } from "@/lib/name-validation";
import { allowConfirmation, allowSubmission, TOO_MANY } from "@/lib/form-rate-limit";
import { mailFrom, siteConfig } from "@/data/siteConfig";
import { checkFields, readFormBody } from "@/lib/form-input";
import { OwnerEmailFailed, sendForm } from "@/lib/form-send";
import { recordServerAction } from "@/lib/server-event";
import { subjectLine } from "@/lib/email-subject";
import { COMMISSION_TERMS, isRequestKind, quoteEmailText, REQUEST_KINDS } from "@/lib/commissions";

/**
 * A commission quote request from /commissions.
 *
 * The contact form's rules, all of them (CLAUDE.md, "Public forms"): a size
 * limit before anything else, a per-IP limit, the owner's copy sent first and
 * a refusal reported as a failure, and a confirmation that repeats nothing
 * the visitor typed, rate-limited per recipient and in total. No uploads: the
 * reply asks for the photos, so nothing a stranger sends is stored here.
 */
export async function POST(request: Request) {
  try {
    const parsed = await readFormBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const body = parsed.body;

    // Honeypot: answered exactly like a real request (lib/server-event.ts).
    if (body.website) {
      if (await allowSubmission("commissions")) await recordServerAction("spam_blocked", request, "/commissions");
      return NextResponse.json({ ok: true });
    }

    if (!(await allowSubmission("commissions"))) {
      return NextResponse.json(TOO_MANY, { status: 429 });
    }

    const tooLong = checkFields(body, ["name", "email", "kind", "size", "deadline", "message"]);
    if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

    const { name, email, kind, size, deadline, message } = body as Record<string, string | undefined>;
    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!isRequestKind(kind)) {
      return NextResponse.json({ error: "Please choose what the painting is of." }, { status: 400 });
    }

    const nameCheck = validateName(name);
    if (!nameCheck.ok) return NextResponse.json({ error: nameCheck.reason }, { status: 400 });

    if (!/\s/.test(message.trim())) {
      return NextResponse.json(
        { error: "Please tell us a little more about the painting. A few sentences is fine." },
        { status: 400 }
      );
    }

    const emailCheck = await validateEmail(email);
    if (!emailCheck.ok) return NextResponse.json({ error: emailCheck.reason }, { status: 400 });

    const resend = new Resend(process.env.RESEND_API_KEY);
    await sendForm(
      "commissions",
      () =>
        resend.emails.send({
          from: mailFrom(),
          to: siteConfig.contact.ownerEmail,
          replyTo: email,
          subject: subjectLine(`Commission request from ${name}: ${REQUEST_KINDS[kind].toLowerCase()}`),
          text: quoteEmailText({ name, email, kind, size, deadline, message }),
        }),
      // Fixed text only: this goes to whatever address was typed in.
      (await allowConfirmation(email))
        ? () =>
            resend.emails.send({
              from: mailFrom(),
              to: email,
              subject: "We received your commission request",
              text: `Hello,\n\nThanks for your commission request. We'll reply within 1 business day with a few questions and a quote. If you have photos of the subject, you can send them in reply to that email.\n\n${COMMISSION_TERMS.deposit} ${COMMISSION_TERMS.turnaround}\n\n${siteConfig.brand}\n${new URL(siteConfig.url).host}`,
            })
        : null
    );

    await recordServerAction("contact_submit", request, "/commissions");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OwnerEmailFailed) console.error(e.message);
    return NextResponse.json({ error: "Failed to send request" }, { status: 500 });
  }
}

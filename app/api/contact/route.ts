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

export async function POST(request: Request) {
  try {
    const parsed = await readFormBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { name, email, message, website } = parsed.body as Record<string, string>;

    // Honeypot — `website` is a hidden field humans don't see. If a bot fills
    // it, silently return success without sending anything. The reply must be
    // identical to a real one, so it's counted here, not by the page.
    if (website) {
      // Counted against the same per-IP limit first, so a bot can't write
      // analytics rows without end (security review, October 2026). The
      // reply is the same either way.
      if (await allowSubmission("contact")) await recordServerAction("spam_blocked", request, "/contact");
      return NextResponse.json({ ok: true });
    }

    if (!(await allowSubmission("contact"))) {
      return NextResponse.json(TOO_MANY, { status: 429 });
    }

    if (!name || !email || !message) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const tooLong = checkFields(parsed.body, ["name", "email", "message"]);
    if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

    const nameCheck = validateName(name);
    if (!nameCheck.ok) {
      return NextResponse.json({ error: nameCheck.reason }, { status: 400 });
    }

    // Real messages contain spaces — random-string spam doesn't.
    if (!/\s/.test(message.trim())) {
      return NextResponse.json(
        { error: "Please write a longer message. A few sentences is fine." },
        { status: 400 }
      );
    }

    const emailCheck = await validateEmail(email);
    if (!emailCheck.ok) {
      return NextResponse.json({ error: emailCheck.reason }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    await sendForm(
      "contact",
      // Notify James
      () =>
        resend.emails.send({
          from: mailFrom(),
          to: siteConfig.contact.ownerEmail,
          replyTo: email,
          subject: subjectLine(`Message from ${name}`),
          text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
        }),
      // The confirmation goes to an address the visitor chose, from this
      // domain, so it repeats nothing they typed and is rate-limited
      // (lib/form-rate-limit.ts).
      (await allowConfirmation(email))
        ? () =>
            resend.emails.send({
              from: mailFrom(),
              to: email,
              subject: "We received your message",
              text: `Hello,\n\nThanks for reaching out! We've received your message and will get back to you within 1 business day.\n\n${siteConfig.brand}\n${new URL(siteConfig.url).host}`,
            })
        : null
    );

    await recordServerAction("contact_submit", request, "/contact");
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OwnerEmailFailed) console.error(e.message);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}

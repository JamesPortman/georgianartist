import { Resend } from "resend";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateEmail } from "@/lib/email-validation";
import { validateName } from "@/lib/name-validation";
import { resolveOrder, type WorkLookup } from "@/lib/order";
import { allowConfirmation, allowSubmission, TOO_MANY } from "@/lib/form-rate-limit";
import { checkFields, readFormBody } from "@/lib/form-input";
import { OwnerEmailFailed, sendForm } from "@/lib/form-send";
import { recordServerAction } from "@/lib/server-event";
import { mailFrom, siteConfig } from "@/data/siteConfig";

const select = { id: true, title: true, sizeType: true, visible: true, soldOut: true } as const;
const works: WorkLookup = {
  one: (id) => prisma.product.findUnique({ where: { id }, select }),
  many: (ids) => prisma.product.findMany({ where: { id: { in: ids } }, select }),
};

/**
 * Print, card and gift-pack enquiries from the Buy Now form.
 *
 * The browser sends ids and choices only (see lib/order.ts); the title, size
 * and price in both emails are looked up here. The confirmation to the
 * visitor repeats nothing they typed — not even their name — because it goes
 * to an address they chose, from this domain.
 */
export async function POST(request: Request) {
  try {
    const parsed = await readFormBody(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { order, name, email, phone, address, website } = parsed.body as Record<string, string>;

    // Honeypot — silently succeed without sending if filled. The reply must be
    // identical to a real one, so it's counted here, not by the page.
    if (website) {
      // Counted against the same per-IP limit first, so a bot can't write
      // analytics rows without end (security review, October 2026). The
      // reply is the same either way.
      if (await allowSubmission("buy")) await recordServerAction("spam_blocked", request, "/");
      return NextResponse.json({ ok: true });
    }

    if (!(await allowSubmission("buy"))) {
      return NextResponse.json(TOO_MANY, { status: 429 });
    }

    if (!order || !name || !email || !phone || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const tooLong = checkFields(parsed.body, ["name", "email", "phone", "address"]);
    if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

    const nameCheck = validateName(name);
    if (!nameCheck.ok) {
      return NextResponse.json({ error: nameCheck.reason }, { status: 400 });
    }

    const resolved = await resolveOrder(order, works);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.reason }, { status: 400 });
    }
    const { title, sizeLabel, price, details } = resolved.order;

    const emailCheck = await validateEmail(email);
    if (!emailCheck.ok) {
      return NextResponse.json({ error: emailCheck.reason }, { status: 400 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    await sendForm(
      "buy",
      // Notify James
      () =>
        resend.emails.send({
          from: mailFrom(),
          to: siteConfig.contact.ownerEmail,
          replyTo: email,
          subject: `Purchase Enquiry: ${title}, ${sizeLabel}`,
          text: `New purchase enquiry\n\nProduct: ${title}\nSize: ${sizeLabel}\nPrice: CA$${price.toFixed(2)}\n${details ? `\n${details}\n` : ""}\n---\nCustomer Details:\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nShipping Address:\n${address}`,
        }),
      // Confirm to customer — server-side values only
      (await allowConfirmation(email))
        ? () =>
            resend.emails.send({
              from: mailFrom(),
              to: email,
              subject: `Your enquiry for ${title}`,
              text: `Hello,\n\nThanks for your interest! We've received your enquiry for:\n\n  ${title}\n  Size: ${sizeLabel}\n  Price: CA$${price.toFixed(2)}\n\nWe'll confirm availability and send e-transfer payment details within 1 business day.\n\n${siteConfig.brand}\n${new URL(siteConfig.url).host}`,
            })
        : null
    );

    // Packs have no single work; prints and cards do.
    const posted = (parsed.body as Record<string, unknown>).order;
    const productId =
      posted && typeof posted === "object" && typeof (posted as { productId?: unknown }).productId === "string"
        ? (posted as { productId: string }).productId
        : null;
    await recordServerAction("buy_submit", request, "/", productId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OwnerEmailFailed) console.error(e.message);
    return NextResponse.json({ error: "Failed to send enquiry" }, { status: 500 });
  }
}

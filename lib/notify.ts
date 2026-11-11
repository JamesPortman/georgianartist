import { Resend } from "resend";
import { mailFrom, siteConfig } from "@/data/siteConfig";
import { subjectLine } from "@/lib/email-subject";

/** Where operational alerts go — the site owner. */
const ALERT_TO = siteConfig.contact.ownerEmail;
const ALERT_FROM = mailFrom();

/**
 * Send an operational alert email (e.g. a failed Instagram post or an invalid
 * access token). Best-effort: never throws, so callers can fire it from inside
 * an error handler without masking the original failure. If RESEND_API_KEY is
 * missing or the send fails, it just logs.
 */
export async function sendAlert(subject: string, text: string, prefix = "⚠️"): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.error("[alert] RESEND_API_KEY not set, cannot email alert:", subject);
    return;
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject: `${prefix} ${subjectLine(subject)}`,
      text,
    });
  } catch (e) {
    console.error("[alert] failed to send alert email:", e instanceof Error ? e.message : String(e));
  }
}

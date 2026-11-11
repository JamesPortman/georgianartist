/**
 * Text made fit for an email subject: one line, no control characters.
 *
 * Subjects carry what visitors type (a name on the contact and booking
 * forms) and what browsers report (an error's path). A line break there is
 * at best a broken subject and at worst an extra header, depending on how
 * the provider builds the message (security review, October 2026).
 */
export function subjectLine(text: string, max = 200): string {
  return text
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

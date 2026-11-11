import { describe, it, expect } from "vitest";
import fs from "node:fs";

/**
 * Both booking emails must carry a Reply-To.
 *
 * They send from noreply@georgianartist.com, which is a real limitation
 * dressed as a convention: nobody reads that address. The notification sets
 * Reply-To to the submitter so James can answer from his inbox. The
 * autoresponder needs one too, and for the same reason in reverse — it tells
 * the visitor "I'll reply within a day with a couple of times that suit",
 * which invites an answer, and an answer sent to noreply@ is gone.
 *
 * That is a lead lost *after* it was won, which is worse than the mailto:
 * submission the handoff rejected: the visitor believes they are in contact.
 *
 * Asserted against the source rather than a mocked Resend because the risk is
 * someone adding a third send — a reminder, a notification — and not thinking
 * about the header at all. This fails on any send that omits it.
 */

const SOURCE = "app/api/book/route.ts";

/** Each `resend.emails.send({...})` call in the route, as source text. */
function sendCalls(src: string): string[] {
  const calls: string[] = [];
  const marker = "resend.emails.send({";
  let i = src.indexOf(marker);
  while (i !== -1) {
    // Walk from the opening brace to its match, so nested braces and template
    // literals in the body don't end the call early.
    let depth = 0;
    let j = i + marker.length - 1;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    calls.push(src.slice(i, j + 1));
    i = src.indexOf(marker, j);
  }
  return calls;
}

describe("booking emails", () => {
  const src = fs.readFileSync(SOURCE, "utf8");
  const calls = sendCalls(src);

  it("sends exactly the two the handoff specifies", () => {
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["the notification to James", 0],
    ["the autoresponder to the submitter", 1],
  ])("sets a Reply-To on %s", (_label, i) => {
    expect(calls[i]).toMatch(/replyTo:/);
  });

  it("points the autoresponder's replies at a mailbox that is read", () => {
    // The owner inbox, which is a config value now rather than a literal —
    // asserted by role, not by spelling, so changing the address in
    // data/siteConfig.ts doesn't fail a test about Reply-To. What must stay
    // true: not noreply@, and not the submitter's own address.
    expect(calls[1]).toMatch(/replyTo:\s*siteConfig\.contact\.ownerEmail/);
    expect(calls[1]).not.toMatch(/replyTo:\s*fields\.email/);
  });

  it("answers the notification back to whoever submitted it", () => {
    expect(calls[0]).toMatch(/replyTo:\s*fields\.email/);
  });
});

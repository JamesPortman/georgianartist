import { securityTxt } from "@/lib/security-txt";

/**
 * /.well-known/security.txt (RFC 9116): where to report a security problem.
 * For a one-person site this is how real-world findings arrive. Nobody is
 * paid to look, but people who find a hole look for this file first.
 *
 * Built at deploy time, so Expires is a year from the last deploy. A site
 * that hasn't been deployed in a year has a stale file, which is the honest
 * signal. The comment lines are the disclosure policy.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(securityTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

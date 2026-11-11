import { siteConfig } from "@/data/siteConfig";

/**
 * The body of /.well-known/security.txt (RFC 9116). See the route for why.
 * Expires is a year from `now`; the route is built at deploy time, so it is a
 * year from the last deploy.
 */
export function securityTxt(now = new Date()): string {
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return [
    "# Found a security problem with this site? Please email the address below,",
    "# with what you found and how to reproduce it. You'll get a reply within a few days.",
    "# Please don't read or change anyone else's data, send mail through the forms,",
    "# or point automated scanners at the live site; a local copy is fine.",
    `Contact: mailto:${siteConfig.contact.email}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${siteConfig.url}/.well-known/security.txt`,
    "",
  ].join("\n");
}

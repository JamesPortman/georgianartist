/**
 * The one place the copyright claim is written down.
 *
 * It is asserted in three places that have to agree: the site footer, the
 * metadata baked into the repo's image files, and the metadata baked into
 * images uploaded through the admin. They have already drifted apart once —
 * the footer said one holder and every image file said another — so they all
 * read from here now.
 */

import { siteConfig } from "@/data/siteConfig";

/**
 * Who made the work.
 *
 * Read from `data/siteConfig.ts` rather than written here: the identity of
 * whose site this is belongs in one file, so a fork changes it once. The
 * copyright-specific decisions below — holder versus credit, the start year,
 * the wording of the notice — still live here, because they are claims about
 * rights rather than branding.
 */
export const ARTIST = siteConfig.artist;

/**
 * Who owns the rights, versus the name the work is published under. Different
 * claims, different fields: the copyright notice names the holder, the credit
 * line names the brand you would print beneath the image. Conflating them is
 * what produced a brand-as-copyright-holder notice on every photograph.
 */
export const RIGHTS_HOLDER = ARTIST;
export const CREDIT = siteConfig.brand;

export const SITE = siteConfig.url;
export const EMAIL = siteConfig.contact.email;

/** The work predates the site by two years. */
export const START_YEAR = 2021;

/**
 * "© 2021–2026 James Portman. All rights reserved."
 *
 * The end year is read at call time, so it rolls over on its own — but note
 * that an image keeps whatever year it was tagged with until it is re-tagged.
 * That is correct: the notice records the year that copy was published.
 */
export function copyrightNotice(now: Date = new Date()): string {
  return `© ${START_YEAR}–${now.getFullYear()} ${RIGHTS_HOLDER}. All rights reserved.`;
}

export const USAGE_TERMS =
  "All rights reserved. No reproduction, distribution, or derivative use " +
  `without written permission. Licensing enquiries: ${EMAIL}`;

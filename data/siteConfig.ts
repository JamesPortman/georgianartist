/**
 * Everything that identifies whose site this is.
 *
 * The point of this file is that a second artist should be able to run this
 * codebase by editing it and nothing else. Every name, domain, address, handle
 * and analytics id below was previously typed into the page that needed it —
 * "Georgian Bay Artists" 46 times, the domain 36 — which meant the identity
 * was not one decision but a hundred, and they could disagree.
 *
 * Two names, not one, and they are not interchangeable:
 *   `brand`  the storefront — what the nav says and what a title ends with
 *   `artist` the person who painted it — what a copyright notice names
 * Collapsing them is what once put a brand name in the rights-holder field of
 * every image in the repo. `lib/copyright.ts` reads both from here.
 *
 * Not in scope: `/for-artists`, `/architecture` and `/book`. Those are James's own pitch for
 * building these sites, not part of an artist's storefront — a fork deletes
 * them rather than rebranding them.
 */
/** A collector's words, shown beneath the gallery. */
export interface Testimonial {
  quote: string;
  attribution: string;
}

/** A published mention of the work. Cited, never reproduced — see PressStrip. */
export interface PressMention {
  quote: string;
  publication: string;
  /** The publication's site, not the article — most are not online. */
  url: string;
  /**
   * The public Vercel Blob store's origin. The catalogue's images live under
   * <blobStore>/catalogue/ (lib/catalogue-images.ts); a fork has its own store.
   */
  blobStore: string;
  /** The piece's title, without quotation marks. */
  article: string;
  /** Free text: "September 2026", "Spring 2025". */
  date: string;
}

export const siteConfig = {
  /** The storefront name: navigation, page titles, JSON-LD brand, email from-name. */
  brand: "Georgian Bay Artists",

  /** The person who makes the work. Names the copyright holder. */
  artist: "James Portman",

  /**
   * What to call the artist in running prose — the Instagram caption prompt
   * asks Claude to write "as if James is speaking". A first name, usually.
   * Kept explicit rather than split off `artist`, because which part of a name
   * someone goes by is not a rule you can derive.
   */
  artistShortName: "James",

  /** The place the work is of. Used where the site describes the subject. */
  locality: "Georgian Bay",

  /** Sits under the heading on the home page. */
  tagline: "Re-imaging the Bay on canvas",

  /**
   * Canonical origin, no trailing slash. Feeds `metadataBase`, the sitemap,
   * JSON-LD image URLs and OG images, so it has to be the host the site
   * actually serves on — the apex redirects to www here.
   */
  url: "https://www.georgianartist.com",
  blobStore: "https://f1wvbcnefdducxwm.public.blob.vercel-storage.com",

  contact: {
    /** Public address. Buy Now, enquiries, licensing. */
    email: "info@georgianartist.com",
    /**
     * Where the site's own notifications land — order enquiries, contact form,
     * booking requests, cron failures. Often the same person as `email`
     * reading a forwarded mailbox, but it is a separate decision: this one is
     * never shown to a visitor.
     */
    ownerEmail: "james@portman.ca",
    /** Shown to visitors as a text-me fallback. Empty string hides it. */
    phone: "416-410-8899",
  },

  social: {
    /** Instagram handle without the @. Also the account the cron posts to. */
    instagram: "georgian_bay_artist",
  },

  analytics: {
    /** GA4 measurement id. Empty string disables the script entirely. */
    ga4: "G-KKZVBB0PWX",
  },

  /**
   * Social proof, and the two things on the site that are somebody else's
   * words rather than the artist's. Both are `null`-able, and null removes the
   * section rather than leaving an empty heading — a fork starts with no
   * collectors and no press, and should not have to delete markup to say so.
   *
   * The `as … | null` is what makes that possible: without it TypeScript
   * infers the object type, the null branch becomes unreachable, and the
   * component that checks for it gets flagged as always-true.
   */
  testimonial: {
    quote:
      "I bought a painting for my wife as a Christmas present and she absolutely loves it. " +
      "We both love the vibrant colours and the contrast between the sky, the fall leaves, " +
      "the hills and water. It’s a tranquil scene and everyone that visits our house comments " +
      "on how nice it is. My late mother loved the changing leaves in the fall here in Ontario, " +
      "and when I look at this painting I think of her, so it’s very special to me.",
    attribution: "Greg Fisher",
  } as Testimonial | null,

  press: {
    quote: "I’m not after postcards. I’m after the feeling of being there.",
    publication: "Blank Spaces",
    url: "https://www.blankspaces.ca",
    article: "Reimagining the Bay",
    date: "September 2026",
  } as PressMention | null,

  saleBanner: {
    enabled: true,
    // The season prefix (Spring/Summer/Fall/Winter) is added automatically
    // by SaleBanner via lib/season.ts — keep this as just the noun.
    label: "Sale",
    body: "save up to 35% on selected prints. Prices as marked.",
  },

  // Matches CanvasChamp.ca's free-shipping threshold (in CAD).
  freeShipping: {
    threshold: 69,
  },
};

/** `georgianartist.com` — the domain without the www, for display in prose. */
export const bareDomain = () =>
  new URL(siteConfig.url).hostname.replace(/^www\./, "");

/** `Georgian Bay Artists <noreply@georgianartist.com>` — the From on every send. */
export const mailFrom = (local = "noreply") =>
  `${siteConfig.brand} <${local}@${bareDomain()}>`;

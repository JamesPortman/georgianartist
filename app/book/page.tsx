import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import BookingClient from "./BookingClient";
import "./booking.css";
import { siteConfig } from "@/data/siteConfig";

/**
 * Booking page — a free 15-minute intro chat about building an artist a site.
 *
 * This is the scan destination for the QR code on the printed flier. The
 * handoff specified portman.ca/book; James asked for it here instead, and the
 * flier's QR has been regenerated to encode https://www.georgianartist.com/book
 * — see design_handoff_booking_page/README.md, "Assets". The printed code cannot
 * change after printing, so this route must not move or be renamed.
 *
 * Deliberately outside the storefront chrome: the design carries its own
 * masthead, and the sale banner, nav, newsletter and footer would all fight it.
 * StorefrontChrome hides them here, the same way it does for /admin.
 */

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-booking-body",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-booking-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: `Book a free 15-minute chat | ${siteConfig.brand}`,
  description:
    "Fifteen minutes, no pitch. Tell me what you make and what you'd want a site of your own to do, and I'll reply with a couple of times that suit. Websites for artists and artisans, from $999: one time, no monthly fee, you own it.",
  alternates: { canonical: "/book" },
  openGraph: {
    title: "Tell me about your work.",
    description:
      "A free 15-minute chat about a website of your own. From $999: one time, no monthly fee, you own it.",
  },
};

export default function BookPage() {
  return (
    <div className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <BookingClient />
    </div>
  );
}

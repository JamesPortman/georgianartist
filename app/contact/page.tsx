import type { Metadata } from "next";
import ContactClient from "./ContactClient";
import Faq from "@/components/Faq";
import { siteConfig } from "@/data/siteConfig";

// FAQ and Contact are one page ("FAQ/Contact" in the menu): the questions
// first, then the form for anything they don't answer. /faq redirects here.
export const metadata: Metadata = {
  title: `FAQ & Contact | ${siteConfig.brand}`,
  description: `Questions about ordering, shipping, commissions and local pickup for ${siteConfig.brand} paintings and photographs, and how to get in touch.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-12">
      <h1 className="text-3xl font-semibold text-gray-800">FAQ &amp; Contact</h1>
      <Faq />
      <ContactClient />
    </div>
  );
}

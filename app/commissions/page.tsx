import type { Metadata } from "next";
import { catalogue } from "@/lib/catalogue-cache";
import { siteConfig } from "@/data/siteConfig";
import { COMMISSION_TERMS } from "@/lib/commissions";
import CommissionExamples from "./CommissionExamples";
import CommissionRequestForm from "./CommissionRequestForm";

export const metadata: Metadata = {
  title: `Commissions | ${siteConfig.brand}`,
  description: `Commission a painting of your pet, a portrait, or a place that matters to you, from ${siteConfig.artist}. Every commission is quoted individually.`,
  alternates: { canonical: "/commissions" },
};

const STEPS = [
  { title: "Tell us about it", text: "Use the form below: who or what, the size you have in mind, and any deadline." },
  { title: "Quote and sketch", text: "We reply within 1 business day with questions and a quote, then a sketch to approve." },
  { title: "Deposit", text: COMMISSION_TERMS.deposit },
  { title: "Painting and delivery", text: COMMISSION_TERMS.turnaround },
];

export default async function CommissionsPage() {
  // Public read: through the cache, like every catalogue read (lib/catalogue-cache.ts).
  const examples = await catalogue.commissionExample.findMany({
    where: { visible: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, kind: true, name: true, subject: true, medium: true, size: true, image: true, blurDataURL: true },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold text-gray-800 mb-4">Commissions</h1>
        <p className="text-gray-600 leading-relaxed">
          A painting made for you: your dog on the dock, a portrait for an anniversary, a cottage before it
          changes hands. Every commission is quoted individually.
        </p>
      </header>

      {examples.length > 0 && <CommissionExamples examples={examples} />}

      <section aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-2xl font-semibold text-gray-800 mb-6">
          How it works
        </h2>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t-2 border-brand pt-3">
              <p className="text-sm font-semibold text-brand mb-1">
                {i + 1}. {s.title}
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="max-w-2xl">
        <CommissionRequestForm />
      </div>
    </div>
  );
}

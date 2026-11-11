/**
 * The FAQ, shown at the top of /contact ("FAQ/Contact" in the menu). It had
 * its own page until 28 Sep 2026; /faq now redirects here (next.config.ts),
 * because the questions people ask and the form they'd ask them with belong
 * on one page.
 */

export const FAQS = [
  {
    q: "Do you take commissions?",
    a: "Yes, we can create a work based on your idea or photo. Contact us for a quote.",
  },
  {
    q: "How long does order processing take?",
    a: "Processing takes roughly 3 days before dispatch.",
  },
  {
    q: "How long does shipping take within Canada?",
    a: "Delivery within Canada takes 5–7 business days.",
  },
  {
    q: "What shipping carrier do you use?",
    a: "We ship via Canada Post Expedited service.",
  },
  {
    q: "Is local pickup available?",
    a: "Yes, in-person collection is available in the Blue Mountain area upon request.",
  },
];

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20">
      <h2 id="faq-heading" className="text-2xl font-semibold text-gray-800 mb-4">
        Frequently Asked Questions
      </h2>
      <div className="space-y-2">
        {FAQS.map(({ q, a }) => (
          <details
            key={q}
            className="group border border-gray-200 rounded overflow-hidden"
          >
            <summary className="flex items-center justify-between px-4 py-4 cursor-pointer list-none text-base font-semibold text-gray-800 hover:bg-gray-50 transition-colors">
              {q}
              <span className="ml-4 text-gray-500 shrink-0 transition-transform duration-200 group-open:rotate-180">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            <div className="px-4 pb-4 pt-1 text-gray-600 leading-relaxed text-sm border-t border-gray-100">
              {a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

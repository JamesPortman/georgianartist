"use client";

import { useState } from "react";
import { track } from "@/components/AnalyticsTracker";

type Status = "idle" | "loading" | "done" | "error";

// Kit (ConvertKit) form — "Georgian Artist signup". Public subscription
// endpoint; no API key required. Double opt-in is configured on the form.
const KIT_FORM_ID = "9541378";

export default function Newsletter() {
  const [status, setStatus] = useState<Status>("idle");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (website) return; // bot trap — silently drop
    setStatus("loading");
    try {
      const data = new FormData();
      data.append("email_address", email);
      const res = await fetch(
        `https://app.kit.com/forms/${KIT_FORM_ID}/subscriptions`,
        { method: "POST", headers: { Accept: "application/json" }, body: data }
      );
      if (!res.ok) throw new Error("subscribe failed");
      track("newsletter_submit");
      setEmail("");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="border-t border-gray-200 bg-[#f4f1ea] px-6 py-16">
      <div className="max-w-xl mx-auto text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand mb-3">
          The Studio List
        </p>
        <h2 className="text-3xl text-gray-800 mb-3">New paintings, first.</h2>
        <p className="text-gray-600 mb-7 leading-relaxed">
          Be the first to see new Georgian Bay paintings and prints, hear about
          collection releases, and get subscriber-only sale previews. A few
          emails a season, no clutter.
        </p>

        {status === "done" ? (
          <div className="bg-green-50 border border-green-200 rounded p-5 text-green-800">
            Thank you. Please check your email to confirm your subscription.
          </div>
        ) : (
          <form
            method="post"
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
          >
            {/* Honeypot — hidden from humans, harvested by spam bots */}
            <div
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}
            >
              <label htmlFor="nl-website">Website</label>
              <input
                id="nl-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <input
              aria-label="Email address"
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-4 py-3 text-sm bg-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
            >
              {status === "loading" ? "Subscribing…" : "Subscribe"}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-4 text-sm text-red-600">
            Something went wrong. Please try again in a moment.
          </p>
        )}
        <p className="mt-4 text-xs text-gray-600">
          Unsubscribe anytime. We never share your email.
        </p>
      </div>
    </section>
  );
}

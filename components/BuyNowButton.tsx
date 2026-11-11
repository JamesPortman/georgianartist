"use client";

import { useState } from "react";
import { track } from "@/components/AnalyticsTracker";
import { siteConfig } from "@/data/siteConfig";
import type { OrderRequest } from "@/lib/order";

/**
 * The error shown under the form: the server's message as a sentence, and
 * "Please try again." unless it already says so (the rate-limit message does).
 */
function withRetry(message: string | null): string {
  const base = (message || "Something went wrong").trim().replace(/\.?$/, ".");
  return /try again/i.test(base) ? base : `${base} Please try again.`;
}


interface Props {
  /**
   * What is being ordered, as ids and choices. This is all the server sees:
   * it looks up the title and price itself, so the three display props below
   * never reach an email.
   */
  order: OrderRequest;
  /** Display only. */
  title: string;
  /** Display only. */
  sizeLabel: string;
  /** Display only. */
  price: number;
  /** If true, render a smaller secondary-style button in idle state. */
  compact?: boolean;
  /** Optional initial button label (e.g. "Submit Calendar Order"). */
  ctaLabel?: string;
  /** Optional product/photograph id for first-party analytics attribution. */
  productId?: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type Step = "idle" | "form" | "loading" | "done" | "error";

export default function BuyNowButton({
  order,
  title,
  sizeLabel,
  price,
  compact = false,
  ctaLabel,
  productId,
}: Props) {
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", address: "", website: "" });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleOpen() {
    setStep("form");
    track("buy_open", { productId });
    window.gtag?.("event", "begin_checkout", {
      currency: "CAD",
      value: price,
      items: [{ item_name: title, item_variant: sizeLabel, price, quantity: 1 }],
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, ...form }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || "Something went wrong. Please try again.");
        setStep("error");
        return;
      }
      // Not tracked here: /api/buy records "buy_submit" itself, once the
      // email has gone. It answers a caught bot with the same OK (lib/server-event.ts).
      setStep("done");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div role="status" className="bg-green-50 border border-green-200 rounded p-4 text-green-800 text-sm">
        ✓ Enquiry sent! We&apos;ll confirm availability and e-transfer details within 1 business day.
      </div>
    );
  }

  if (step === "idle") {
    return compact ? (
      <button
        onClick={handleOpen}
        className="block w-full text-center bg-white hover:bg-brand-tint text-brand border border-brand font-medium py-1.5 px-3 rounded text-sm transition-colors"
      >
        {ctaLabel ?? `Buy · CA$${price.toFixed(2)}`}
      </button>
    ) : (
      <button
        onClick={handleOpen}
        className="block w-full text-center bg-brand hover:bg-brand-hover text-white font-medium py-3 px-6 rounded transition-colors"
      >
        {ctaLabel ?? "Buy Now"}
      </button>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="border border-gray-200 rounded p-4 space-y-3">
      {/* Honeypot — hidden from humans, harvested by spam bots */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="buy-website">Website</label>
        <input
          id="buy-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={handleChange}
        />
      </div>

      <p className="text-sm font-medium text-gray-700">
        {title} · {sizeLabel} · CA${price.toFixed(2)}
      </p>

      <div>
        <label htmlFor="buy-name" className="block text-xs font-medium text-gray-600 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="buy-name"
          name="name"
          type="text"
          required
          value={form.name}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="buy-email" className="block text-xs font-medium text-gray-600 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="buy-email"
          name="email"
          type="email"
          required
          value={form.email}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="buy-phone" className="block text-xs font-medium text-gray-600 mb-1">
          Phone <span className="text-red-500">*</span>
        </label>
        <input
          id="buy-phone"
          name="phone"
          type="tel"
          required
          value={form.phone}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="buy-address" className="block text-xs font-medium text-gray-600 mb-1">
          Shipping Address <span className="text-red-500">*</span>
        </label>
        <textarea
          id="buy-address"
          name="address"
          rows={2}
          required
          value={form.address}
          onChange={handleChange}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
        />
      </div>

      {step === "error" && (
        <p role="alert" className="text-xs text-red-600">
          {withRetry(errorMsg)} You can also email{" "}
          <a href={`mailto:${siteConfig.contact.email}`} className="underline">
            {siteConfig.contact.email}
          </a>
          .
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={step === "loading"}
          className="flex-1 bg-brand hover:bg-brand-hover text-white font-medium py-2.5 rounded text-sm transition-colors disabled:opacity-60"
        >
          {step === "loading" ? "Sending…" : "Send Enquiry"}
        </button>
        <button
          type="button"
          onClick={() => setStep("idle")}
          className="px-4 py-2.5 border border-gray-300 rounded text-sm text-gray-600 hover:border-gray-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

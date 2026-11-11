"use client";

import { useState } from "react";
import { siteConfig } from "@/data/siteConfig";

/**
 * The error shown under the form: the server's message as a sentence, and
 * "Please try again." unless it already says so (the rate-limit message does).
 */
function withRetry(message: string | null): string {
  const base = (message || "Something went wrong").trim().replace(/\.?$/, ".");
  return /try again/i.test(base) ? base : `${base} Please try again.`;
}


type Status = "idle" | "loading" | "done" | "error";

export default function ContactClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      // Not tracked here: the route records "contact_submit" itself, once the
      // email has gone. It answers a caught bot with the same OK (lib/server-event.ts).
      setStatus("done");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-20">
      <h2 id="contact-heading" className="text-2xl font-semibold text-gray-800 mb-2">Contact Us</h2>
      <p className="text-gray-500 mb-8">We would love to hear your questions or suggestions.</p>

      {status === "done" ? (
        <div role="status" className="bg-green-50 border border-green-200 rounded p-5 text-green-800">
          Thank you! Your message has been sent. We&apos;ll get back to you within 1 business day.
        </div>
      ) : (
        <form method="post" onSubmit={handleSubmit} className="space-y-5">
          {/* Honeypot — hidden from humans, harvested by spam bots */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={handleChange}
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={form.name}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={form.email}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              rows={5}
              required
              value={form.message}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {status === "error" && (
            <p role="alert" className="text-sm text-red-600">
              {withRetry(errorMsg)} You can also email us directly at{" "}
              <a href={`mailto:${siteConfig.contact.email}`} className="underline">
                {siteConfig.contact.email}
              </a>
              .
            </p>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full bg-brand text-white py-2.5 rounded text-sm font-medium hover:bg-brand-hover transition-colors disabled:opacity-60"
          >
            {status === "loading" ? "Sending…" : "Send Message"}
          </button>
        </form>
      )}
    </section>
  );
}

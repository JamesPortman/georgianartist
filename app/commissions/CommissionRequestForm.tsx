"use client";

import { useState } from "react";
import { siteConfig } from "@/data/siteConfig";
import { REQUEST_KINDS, type RequestKind } from "@/lib/commissions";
import { FIELD_MAX } from "@/lib/form-input";

type Status = "idle" | "loading" | "done" | "error";

const input =
  "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand";

/** The quote request. Posts to /api/commissions, which applies every rule the contact form does. */
export default function CommissionRequestForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    kind: "pet" as RequestKind,
    size: "",
    deadline: "",
    message: "",
    website: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error || "Something went wrong.");
        setStatus("error");
        return;
      }
      // Not tracked here: the route records the outcome itself (lib/server-event.ts).
      setStatus("done");
    } catch {
      setErrorMsg("Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <section id="request" aria-labelledby="request-heading" className="scroll-mt-20">
      <h2 id="request-heading" className="text-2xl font-semibold text-gray-800 mb-2">
        Request a quote
      </h2>
      <p className="text-gray-600 mb-8">
        Tell us what you have in mind. We&apos;ll reply within 1 business day, and ask for photos then.
      </p>

      {status === "done" ? (
        <div role="status" className="bg-green-50 border border-green-200 rounded p-5 text-green-800">
          Thank you! Your request has been sent. We&apos;ll get back to you within 1 business day.
        </div>
      ) : (
        <form method="post" onSubmit={handleSubmit} className="space-y-5">
          {/* Honeypot: hidden from people, filled in by bots */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
            <label htmlFor="cr-website">Website</label>
            <input
              id="cr-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={handleChange}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="cr-name" label="Name">
              <input id="cr-name" name="name" type="text" required autoComplete="name" maxLength={FIELD_MAX.name}
                value={form.name} onChange={handleChange} className={input} />
            </Field>
            <Field id="cr-email" label="Email">
              <input id="cr-email" name="email" type="email" required autoComplete="email" maxLength={FIELD_MAX.email}
                value={form.email} onChange={handleChange} className={input} />
            </Field>
          </div>

          <Field id="cr-kind" label="A painting of">
            {/* No name on purpose: the form posts JSON from its state, so a native
                submission never needs it, and with one ZAP's scan posted kind=pet and
                found "pet" in the fixed <option value="pet">, a false reflected-XSS
                finding (rule 10031) that can only be accepted site-wide. */}
            <select
              id="cr-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as RequestKind })}
              className={input}
            >
              {(Object.keys(REQUEST_KINDS) as RequestKind[]).map((k) => (
                <option key={k} value={k}>
                  {REQUEST_KINDS[k]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="cr-size" label="Size in mind (optional)">
              <input id="cr-size" name="size" type="text" placeholder="e.g. 12 x 16 in, or not sure"
                maxLength={FIELD_MAX.size} value={form.size} onChange={handleChange} className={input} />
            </Field>
            <Field id="cr-deadline" label="Needed by (optional)">
              <input id="cr-deadline" name="deadline" type="text" placeholder="e.g. a birthday in March"
                maxLength={FIELD_MAX.deadline} value={form.deadline} onChange={handleChange} className={input} />
            </Field>
          </div>

          <Field id="cr-message" label="Tell us about it">
            <textarea id="cr-message" name="message" rows={5} required maxLength={FIELD_MAX.message}
              value={form.message} onChange={handleChange} className={`${input} resize-none`} />
          </Field>

          {status === "error" && (
            <p role="alert" className="text-sm text-red-600">
              {errorMsg.replace(/\.?$/, ".")} {/try again/i.test(errorMsg) ? "" : "Please try again. "}You can also
              email us at{" "}
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
            {status === "loading" ? "Sending…" : "Send request"}
          </button>
        </form>
      )}
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

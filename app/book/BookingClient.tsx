"use client";

import { useEffect, useState, useRef } from "react";
import { siteConfig } from "@/data/siteConfig";

/** The four `+` registration marks. Every framed element keeps them. */
function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}

const CURRENT_OPTIONS = [
  "Instagram or Facebook only",
  "Squarespace, Wix or similar",
  "Etsy or another marketplace",
  "An old site that needs replacing",
  "Nothing online yet",
] as const;

const FAQ = [
  {
    q: "Can I update it myself?",
    a: "Yes, that's the point. If you'd rather not, send me the photos and I'll post them.",
  },
  {
    q: "Do I keep my domain and photos?",
    a: "All of it, always: domain, images, and your mailing list. Nothing is held hostage.",
  },
  {
    q: "Can you move my existing site over?",
    a: "Usually yes, including any archive of past work.",
  },
];

type Status = "idle" | "sending" | "sent" | "error";

export default function BookingClient() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // Time-to-submit check: a form completed in under a couple of seconds was
  // filled by a script. Paired with the honeypot, per the handoff's "no visible
  // CAPTCHA" requirement.
  //
  // Stamped on mount rather than during render: Date.now() is impure, and a
  // render may be run and thrown away, so the clock has to start somewhere React
  // will only go once. Mount is also the honest zero — it is the first moment a
  // person could type anything.
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return; // a slow connection must not double-send
    setStatus("sending");
    setError(null);

    const data = Object.fromEntries(new FormData(e.currentTarget).entries());

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No stamp means we cannot say how long this took, so we say nothing at
        // all rather than claim zero — checkBookingSubmission treats a missing
        // elapsedMs as "unknown, let it through", and turning a real enquiry
        // away is far worse than letting one bot past the second of two gates.
        body: JSON.stringify({
          ...data,
          elapsedMs: openedAt.current === null ? undefined : Date.now() - openedAt.current,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Something went wrong sending that.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Something went wrong sending that.");
      setStatus("error");
    }
  }

  return (
    <div className="booking">
      <div className="booking-inner">
        <header className="booking-masthead booking-display">
          <div className="booking-wordmark">
            GeorgianArtist<span>.com</span>
          </div>
          <div className="booking-standfirst">
            Websites for artists &amp; artisans
            <br />
            Georgian Bay, Ontario
          </div>
        </header>

        <div className="booking-hero">
          <div className="booking-kicker booking-display">Book a free 15-minute chat</div>
          <h1 className="booking-display">Tell me about your work.</h1>
          <p>
            Fifteen minutes, no pitch. What you make, who buys it, and what you&rsquo;d want a
            site of your own to do. Fill this in and I&rsquo;ll reply with a couple of times
            that suit.
          </p>
        </div>

        <div className="booking-price booking-display">
          <div className="booking-price-figure">From $999</div>
          <div className="booking-price-terms">
            One time &nbsp;·&nbsp; no monthly fee &nbsp;·&nbsp; you own it
          </div>
        </div>

        <form method="post" onSubmit={onSubmit} className="card blueprint booking-form" noValidate={false}>
          <Corners />

          <div className="booking-grid">
            <div className="field">
              <label htmlFor="bk-name">Your name</label>
              <input className="input" id="bk-name" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="bk-email">Email</label>
              <input className="input" id="bk-email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="bk-phone">Phone (if texting is easier)</label>
              <input className="input" id="bk-phone" name="phone" type="tel" />
            </div>
            <div className="field">
              <label htmlFor="bk-medium">What you make</label>
              <input
                className="input"
                id="bk-medium"
                name="medium"
                placeholder="Painting, pottery, woodwork…"
              />
            </div>
            <div className="field">
              <label htmlFor="bk-town">Town</label>
              <input
                className="input"
                id="bk-town"
                name="town"
                placeholder="Collingwood, Meaford…"
              />
            </div>
            <div className="field">
              <label htmlFor="bk-current">Where you are now</label>
              <select className="input" id="bk-current" name="current" defaultValue={CURRENT_OPTIONS[0]}>
                {CURRENT_OPTIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="bk-notes">Anything you&rsquo;d like the site to do</label>
            <textarea
              className="input"
              id="bk-notes"
              name="notes"
              rows={4}
              placeholder="A catalogue of available work, a mailing list, show dates…"
            />
          </div>

          {/* Honeypot — hidden from people, irresistible to bots. */}
          <div className="booking-hp" aria-hidden="true">
            <label htmlFor="bk-website">Website</label>
            <input id="bk-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="booking-actions">
            <button
              type="submit"
              className="btn btn-primary blueprint"
              disabled={status === "sending"}
            >
              <Corners />
              {status === "sending" ? "Sending…" : "Send it to James"}
            </button>
            <div className="booking-fallback">
              Or text <strong>{siteConfig.contact.phone}</strong> ·{" "}
              <a href={`mailto:${siteConfig.contact.ownerEmail}`}>{siteConfig.contact.ownerEmail}</a>
            </div>
          </div>

          {status === "sent" && (
            <div className="booking-panel" role="status">
              Thanks, I&rsquo;ve got it. I&rsquo;ll reply within a day with a couple of times
              that suit. In a hurry? Text {siteConfig.contact.phone}.
            </div>
          )}

          {status === "error" && (
            <div className="booking-panel" role="alert">
              {error} Please try again, or text <strong>{siteConfig.contact.phone}</strong> or write to{" "}
              <a href={`mailto:${siteConfig.contact.ownerEmail}`}>{siteConfig.contact.ownerEmail}</a>{" "}
              and I&rsquo;ll pick it up from there.
            </div>
          )}
        </form>

        <div className="booking-faq">
          {FAQ.map((item) => (
            <div className="card blueprint" key={item.q}>
              <Corners />
              <div className="card-title">{item.q}</div>
              <p className="card-body">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

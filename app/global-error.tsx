"use client";

import { useEffect } from "react";
import { BRAND } from "@/lib/brand";
import { reportClientError } from "@/components/ClientErrorReporter";

/**
 * The last resort: only reached when the root layout itself throws, so it
 * must render its own <html> and <body>. Plain markup, no dependencies on
 * anything that might be what broke.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A browser-side failure is reported from here; a server one already was.
  useEffect(() => reportClientError(error, "browser (root)"), [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "5rem 1rem" }}>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
        <p style={{ color: "#4b5563", marginBottom: "2rem" }}>
          The site couldn&rsquo;t load just now. Please try again in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{ background: BRAND.green, color: "#fff", border: 0, borderRadius: 4, padding: "0.6rem 1.5rem", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

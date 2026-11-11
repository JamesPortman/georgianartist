"use client";

import { useEffect } from "react";

/**
 * Sends errors thrown in the browser to /api/client-error (lib/client-error.ts),
 * which records them beside the server's. The error pages call
 * reportClientError() for a component that crashed while rendering; this
 * component, in the root layout, listens for what no error page sees: a click
 * handler or a promise that throws.
 *
 * Only this site's own scripts are reported (an extension's or an embed's
 * errors are not ours to fix), at most five per page load, and never twice.
 */

type Kind = "browser (page)" | "browser (root)" | "browser (event)" | "browser (promise)";

const MAX_PER_LOAD = 5;
const sent = new Set<string>();

export function reportClientError(error: unknown, kind: Kind): void {
  try {
    // An error with a digest came from the server, which has already reported it.
    if (error && typeof error === "object" && "digest" in error && (error as { digest?: unknown }).digest) return;
    const e = error instanceof Error ? error : new Error(String(error));
    const key = `${kind}|${e.message}`;
    if (sent.has(key) || sent.size >= MAX_PER_LOAD) return;
    sent.add(key);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack ?? "", path: location.pathname, kind }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never add a second failure to the first.
  }
}

/** True when the error came from a script this site served. */
function ours(source: string | undefined, stack: string | undefined): boolean {
  const origin = location.origin;
  return Boolean(source?.startsWith(origin) || stack?.includes(`${origin}/_next/`));
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const err = event.error instanceof Error ? event.error : new Error(event.message);
      if (ours(event.filename, err.stack)) reportClientError(err, "browser (event)");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof Error && ours(undefined, reason.stack)) reportClientError(reason, "browser (promise)");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

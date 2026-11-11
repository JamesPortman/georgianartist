"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { ActionName, TrackPayload } from "@/lib/analytics";

/**
 * Fire-and-forget POST to the first-party analytics ingest route. Uses
 * `keepalive` so the request survives a navigation, and never rejects.
 */
function send(payload: TrackPayload) {
  if (typeof window === "undefined") return;
  if (payload.path.startsWith("/admin")) return; // never track admin UI
  try {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Record a visitor action (Buy Now open/submit, contact submit, product click,
 * outbound click). Import and call from any client component.
 */
export function track(
  action: ActionName,
  opts: { productId?: string; path?: string } = {}
) {
  send({
    kind: "action",
    action,
    path: opts.path ?? (typeof window !== "undefined" ? window.location.pathname : ""),
    productId: opts.productId,
  });
}

/**
 * Set by the 404 page while it renders, so the tracker below can tell a real
 * pageview from a failed one.
 *
 * A 404 renders inside the root layout, so the tracker fired for it like any
 * other page — and dead inbound links from the old Squarespace site turned into
 * 642 "pageviews" from 642 distinct "visitors", 37% of the whole table. 448 of
 * them were one URL, /home/p/lone-tree, for a painting that no longer exists.
 *
 * Recorded as ordinary pageviews they inflate views and unique visitors alike,
 * and they look exactly like real traffic that never engages with anything.
 *
 * The beacon sets this from an effect, not during render. Tree order still
 * carries the guarantee: the layout renders {children} — where the 404 lives —
 * before the sibling AnalyticsTracker, and React flushes passive effects in
 * that same order, so the flag is set before the tracker reads it.
 *
 * Doing it in render looked equivalent and was not. React treats a render as
 * repeatable — it may run one and throw it away — so a write during render can
 * happen twice or not at all, which is what react-hooks/globals objects to. It
 * also ran on the server, where this module is shared between concurrent
 * requests; nothing read it there, so nothing broke, but one request was
 * writing to another's state.
 */
let notFoundPath: string | null = null;

/**
 * Rendered by app/not-found.tsx. Marks the current path as a 404 so it is not
 * counted as a pageview.
 */
export function NotFoundBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    notFoundPath = pathname;
  }, [pathname]);
  return null;
}

/**
 * Mounted once in the root layout. Fires a pageview on first load and on every
 * client-side route change. Skips /admin paths and 404s.
 */
export default function AnalyticsTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname === lastPath.current) return; // de-dupe re-renders
    lastPath.current = pathname;
    if (pathname.startsWith("/admin")) return;
    // A failed request is not a page view of anything.
    if (notFoundPath === pathname) return;

    send({
      kind: "pageview",
      path: pathname,
      referrer: typeof document !== "undefined" ? document.referrer : undefined,
    });
  }, [pathname]);

  return null;
}

"use client";

import { useEffect } from "react";

/**
 * The numbered sections are <details>, closed until opened. Two things make
 * that work for a reader arriving by link:
 *
 *   - A #fragment (a deep link such as the test inventory's "Architecture
 *     §10") opens the section it points into, on load and on every hash
 *     change, and clicking the same link again reopens a section the reader
 *     has since closed.
 *   - Expand all / Collapse all, for reading the whole page or searching it.
 */
function openFromHash() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  const section = target?.closest("details");
  if (section && !section.open) {
    section.open = true;
    target!.scrollIntoView();
  }
}

export function OpenSectionOnHash() {
  useEffect(() => {
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    // Clicking a link to the current hash fires no hashchange.
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (link && link.getAttribute("href") === window.location.hash) setTimeout(openFromHash);
    };
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openFromHash);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}

export function ExpandAll() {
  const setAll = (open: boolean) =>
    document.querySelectorAll<HTMLDetailsElement>("details[data-section]").forEach((d) => {
      d.open = open;
    });
  return (
    <span className="text-sm normal-case tracking-normal font-normal">
      <button type="button" onClick={() => setAll(true)} className="text-brand underline underline-offset-2 hover:no-underline">
        Expand all
      </button>
      <span aria-hidden="true" className="text-gray-400 mx-2">·</span>
      <button type="button" onClick={() => setAll(false)} className="text-brand underline underline-offset-2 hover:no-underline">
        Collapse all
      </button>
    </span>
  );
}

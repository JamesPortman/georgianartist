"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The full-screen image viewer on a painting's and a photograph's page.
 *
 * A dialog a keyboard or screen-reader user can use, not only a mouse:
 * announced as a modal dialog with a name; focus moves to Close on opening,
 * Tab stays inside, Escape closes, and focus returns to the button that opened
 * it. Until October 2026 it was a plain overlay: focus stayed behind it, Tab
 * walked the page underneath, and a screen reader never heard it open.
 * Clicking outside the picture still closes it.
 */
export default function Lightbox({
  label,
  onClose,
  children,
}: {
  /** What the dialog is called, e.g. "Lora Bay, enlarged". */
  label: string;
  onClose: () => void;
  /** The picture, and anything shown with it (a credit). */
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => opener?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    const focusable = [
      ...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
    >
      <button
        ref={close}
        className="absolute top-4 right-5 text-white/70 hover:text-white text-4xl font-light leading-none rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      {children}
    </div>
  );
}

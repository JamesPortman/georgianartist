"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/data/siteConfig";

export default function Navigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  // Escape closes the phone menu and puts focus back on its button, as a
  // keyboard user expects of any disclosure.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // The storefront. Architecture lives in the footer (components/Footer.tsx);
  // ten links was more than a visitor could scan.
  const links = [
    { href: "/", label: "Paintings" },
    { href: "/photographs", label: "Photographs" },
    // Third, right after the work itself: the one thing on the menu that sells.
    { href: "/gift-shop", label: "Gift Shop" },
    { href: "/locations", label: "Locations" },
    { href: "/making-of", label: "Making Of" },
    { href: "/about", label: "About" },
    // Last of the shop links, where people look for it. One page with the FAQ.
    { href: "/contact", label: "FAQ/Contact" },
  ];

  // For Artists speaks to a different reader — another artist, not a buyer —
  // so it sits apart from the shop links as a button: a separate door rather
  // than an eighth thing to scan.
  const forArtists = { href: "/for-artists", label: "For Artists" };
  const onForArtists = pathname === forArtists.href;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-wide text-gray-800">
          {siteConfig.brand}
        </Link>

        {/* Desktop nav. It once held ten links, which at 1024px wrapped onto two
            lines; measure at 1024 before adding more. */}
        <nav className="hidden lg:flex items-center gap-5 xl:gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={`text-sm tracking-wide whitespace-nowrap transition-colors ${
                pathname === l.href
                  ? "text-brand font-semibold"
                  : "text-gray-600 hover:text-brand"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <span aria-hidden="true" className="h-5 w-px bg-gray-200" />
          <Link
            href={forArtists.href}
            data-audience="artists"
            className={`text-sm tracking-wide whitespace-nowrap rounded-full border px-3 py-1 transition-colors ${
              onForArtists
                ? "bg-brand border-brand text-white"
                : "border-brand/40 text-brand hover:bg-brand hover:text-white"
            }`}
          >
            {forArtists.label}
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          ref={menuButton}
          className="lg:hidden text-gray-600"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav id="mobile-menu" aria-label="Menu" className="lg:hidden border-t border-gray-100 bg-white">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-3 text-sm border-b border-gray-50 ${
                pathname === l.href ? "text-brand font-semibold" : "text-gray-600"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href={forArtists.href}
            data-audience="artists"
            onClick={() => setMenuOpen(false)}
            className={`block px-4 py-3 text-sm border-t-4 border-gray-100 ${
              onForArtists ? "text-brand font-semibold" : "text-brand"
            }`}
          >
            {forArtists.label} →
          </Link>
        </nav>
      )}
    </header>
  );
}

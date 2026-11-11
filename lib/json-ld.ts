/**
 * Serialize an object for embedding inside a <script type="application/ld+json">
 * block. JSON.stringify escapes quotes but NOT "<" -- so a DB-sourced string
 * containing "</script>" would terminate the script block early and execute as
 * HTML (stored XSS). Escaping "<" as \\u003c is valid JSON, so search engines
 * parse the structured data identically. U+2028/U+2029 are escaped for the
 * same reason (legal in JSON but able to break inline-script parsing).
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

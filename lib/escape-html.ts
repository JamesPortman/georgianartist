/**
 * Text made safe to place inside HTML, between tags or in a quoted attribute.
 * For the few places that build markup as a string (Leaflet popups); React
 * escapes everything else itself.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

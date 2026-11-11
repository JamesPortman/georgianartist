import { describe, it, expect } from "vitest";
import { escapeHtml } from "../lib/escape-html";

describe("escapeHtml", () => {
  it("turns markup into text", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;"
    );
  });

  it("escapes & first, so an existing entity is shown, not decoded", () => {
    expect(escapeHtml("Rock &amp; Roll")).toBe("Rock &amp;amp; Roll");
  });

  it("leaves ordinary titles alone", () => {
    expect(escapeHtml("Lora Bay at Dawn, 2026")).toBe("Lora Bay at Dawn, 2026");
  });
});

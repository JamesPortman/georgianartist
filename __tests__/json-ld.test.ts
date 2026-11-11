import { describe, it, expect } from "vitest";
import { safeJsonLd } from "@/lib/json-ld";

describe("safeJsonLd", () => {
  it("neutralizes a </script> breakout in string values", () => {
    const out = safeJsonLd({
      "@type": "Product",
      description: '</script><script>alert("xss")</script>',
    });
    // No raw "<" may survive — the HTML parser would honor it even inside a JSON string.
    expect(out).not.toContain("<");
    expect(out).toContain("\\u003c");
  });

  it("round-trips identically through JSON.parse", () => {
    const data = {
      name: 'Painting "with quotes" & </script> tricks',
      price: 119,
      nested: { tags: ["<b>", "safe"] },
    };
    expect(JSON.parse(safeJsonLd(data))).toEqual(data);
  });

  it("escapes U+2028/U+2029 line separators", () => {
    const out = safeJsonLd({ note: "line\u2028break\u2029end" });
    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(out)).toEqual({ note: "line\u2028break\u2029end" });
  });

  it("leaves ordinary product data unchanged", () => {
    const data = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Council Beach",
      offers: { priceCurrency: "CAD", lowPrice: 99 },
    };
    expect(safeJsonLd(data)).toBe(JSON.stringify(data));
  });
});

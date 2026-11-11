import { describe, it, expect } from "vitest";
import { subjectLine } from "../lib/email-subject";

describe("subjectLine", () => {
  it("puts a name with line breaks on one line", () => {
    expect(subjectLine("Message from Jane\r\nBcc: victim@example.com")).toBe("Message from Jane Bcc: victim@example.com");
  });

  it("drops every control character, including tabs, NUL and Unicode line separators", () => {
    expect(subjectLine("a\tb\u0000c\u2028d\u007fe")).toBe("a b c d e");
  });

  it("collapses runs of space and caps the length", () => {
    expect(subjectLine("  Lora   Bay  ")).toBe("Lora Bay");
    expect(subjectLine("x".repeat(500))).toHaveLength(200);
  });
});

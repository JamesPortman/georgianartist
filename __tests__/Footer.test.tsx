import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Footer, { INSTAGRAM_HANDLE } from "../components/Footer";

afterEach(cleanup);

/**
 * The footer renders on every page via the root layout, so a wrong handle here
 * is a wrong handle site-wide.
 */
describe("Footer", () => {
  it("links to the Instagram account the cron posts to", () => {
    render(<Footer />);
    const link = screen.getByRole("link", { name: /instagram/i });
    expect(link.getAttribute("href")).toBe(
      `https://www.instagram.com/${INSTAGRAM_HANDLE}/`
    );
  });

  it("shows the handle as text, not just as a URL", () => {
    render(<Footer />);
    expect(screen.getByText(`@${INSTAGRAM_HANDLE}`)).toBeDefined();
  });

  it("opens in a new tab without handing the target window a reference back", () => {
    render(<Footer />);
    const link = screen.getByRole("link", { name: /instagram/i });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("links the pages kept out of the header menu", () => {
    render(<Footer />);
    const more = screen.getByRole("navigation", { name: "More" });
    const hrefs = [...more.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/architecture"]);
  });

  it("credits James Portman from 2021, with the current year as the end", () => {
    render(<Footer />);
    expect(
      screen.getByText(
        new RegExp(`Copyright 2021–${new Date().getFullYear()} James Portman`)
      )
    ).toBeDefined();
  });
});

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * The testimonial and the press strip are the two places the site speaks in
 * somebody else's voice, and the only two that a fork starts without.
 *
 * Which makes the null case the point of the whole change: a new artist has no
 * collectors and no coverage, and "What collectors say" above an empty space
 * is worse than nothing at all. Rendering with content is the easy half and is
 * covered below too, but the empty half is what these components are for.
 */

const CONTENT = {
  testimonial: { quote: "A tranquil scene, and everyone comments on it.", attribution: "Greg Fisher" },
  press: {
    quote: "I’m not after postcards.",
    publication: "Blank Spaces",
    url: "https://www.blankspaces.ca",
    article: "Reimagining the Bay",
    date: "September 2026",
  },
};

const mockConfig = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/data/siteConfig", () => ({ siteConfig: mockConfig.value }));

afterEach(cleanup);
beforeEach(() => {
  for (const k of Object.keys(mockConfig.value)) delete mockConfig.value[k];
});

async function renderTestimonial() {
  const { default: C } = await import("../components/Testimonial");
  return render(<C />);
}
async function renderPress() {
  const { default: C } = await import("../components/PressStrip");
  return render(<C />);
}

describe("Testimonial", () => {
  it("renders the quote and who said it", async () => {
    Object.assign(mockConfig.value, CONTENT);
    await renderTestimonial();
    expect(screen.getByText(/tranquil scene/)).toBeTruthy();
    expect(screen.getByText(/Greg Fisher/)).toBeTruthy();
    expect(screen.getByText(/what collectors say/i)).toBeTruthy();
  });

  it("renders nothing at all when there is no testimonial", async () => {
    Object.assign(mockConfig.value, { ...CONTENT, testimonial: null });
    const { container } = await renderTestimonial();
    // Not just the quote — the heading and the <section> must go too, or a
    // fork ships an empty "What collectors say" above a blank gap.
    expect(screen.queryByText(/what collectors say/i)).toBeNull();
    expect(container.querySelector("section")).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});

describe("PressStrip", () => {
  it("cites the publication and links to it", async () => {
    Object.assign(mockConfig.value, CONTENT);
    await renderPress();
    expect(screen.getByText(/not after postcards/)).toBeTruthy();
    const link = screen.getByRole("link", { name: /blank spaces/i });
    expect(link.getAttribute("href")).toBe("https://www.blankspaces.ca");
    // Opening a third-party site in a new tab without this is a tabnabbing
    // hole; it was there before this refactor and must survive it.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("names the article and the date", async () => {
    Object.assign(mockConfig.value, CONTENT);
    await renderPress();
    expect(screen.getByText(/Reimagining the Bay/)).toBeTruthy();
    expect(screen.getByText(/September 2026/)).toBeTruthy();
  });

  it("renders nothing at all when there is no press mention", async () => {
    Object.assign(mockConfig.value, { ...CONTENT, press: null });
    const { container } = await renderPress();
    expect(screen.queryByText(/as featured in/i)).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});

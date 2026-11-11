import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import GalleryGrid from "../components/GalleryGrid";

afterEach(cleanup);

/**
 * Sold-out work now appears in the ordinary gallery, so the line between what
 * a visitor can buy and what they can't has to be visible at a glance — not
 * left to reading a badge on every card.
 */

const items = [
  { id: "lora-bay" },
  { id: "lone-tree", soldOut: true },
  { id: "peasemarsh" },
];
const card = (p: { id: string }) => <div key={p.id} data-testid="card">{p.id}</div>;

describe("GalleryGrid", () => {
  it("puts sold-out work in its own section under a heading", () => {
    render(<GalleryGrid items={items} render={card} />);

    const section = screen.getByRole("region", { name: /sold out/i });
    expect(within(section).getAllByTestId("card").map((c) => c.textContent)).toEqual(["lone-tree"]);
  });

  it("renders the work for sale before the sold-out section", () => {
    const { container } = render(<GalleryGrid items={items} render={card} />);

    const ids = [...container.querySelectorAll('[data-testid="card"]')].map((c) => c.textContent);
    expect(ids).toEqual(["lora-bay", "peasemarsh", "lone-tree"]);
  });

  it("leaves the heading out when nothing is sold out", () => {
    render(<GalleryGrid items={[{ id: "lora-bay" }]} render={card} />);
    expect(screen.queryByRole("region", { name: /sold out/i })).toBeNull();
  });

  it("shows a plain grid in the Sold-out filter view", () => {
    // Every item there is sold out; a heading would only repeat the filter.
    render(<GalleryGrid items={[{ id: "lone-tree", soldOut: true }]} render={card} soldOutView />);
    expect(screen.queryByRole("region", { name: /sold out/i })).toBeNull();
    expect(screen.getAllByTestId("card")).toHaveLength(1);
  });
});

describe("GalleryGrid image priority", () => {
  const flagged = (list: { id: string; soldOut?: boolean }[], soldOutView = false) => {
    const seen: [string, boolean][] = [];
    render(
      <GalleryGrid
        items={list}
        soldOutView={soldOutView}
        render={(p, priority) => {
          seen.push([p.id, priority]);
          return <div key={p.id} />;
        }}
      />
    );
    return seen;
  };

  it("marks the first two cards for sale, and nothing in the sold-out section below them", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "x", soldOut: true }, { id: "c" }];
    expect(flagged(list)).toEqual([
      ["a", true],
      ["b", true],
      ["c", false],
      ["x", false],
    ]);
  });

  it("marks the first sold-out cards when they are all there is", () => {
    expect(flagged([{ id: "x", soldOut: true }, { id: "y", soldOut: true }, { id: "z", soldOut: true }])).toEqual([
      ["x", true],
      ["y", true],
      ["z", false],
    ]);
    cleanup();
    expect(flagged([{ id: "x", soldOut: true }, { id: "y", soldOut: true }, { id: "z", soldOut: true }], true)).toEqual([
      ["x", true],
      ["y", true],
      ["z", false],
    ]);
  });
});

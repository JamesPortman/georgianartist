import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ProductCard from "../components/ProductCard";

afterEach(cleanup);

// next/image renders as a plain <img> in the test environment
vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      blurDataURL?: string;
      priority?: boolean;
    }
  ) => {
    // next/image-only props — passing them through would have React warn about
    // unknown DOM attributes on every render.
    const { fill: _fill, blurDataURL: _blurDataURL, priority, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} data-priority={priority ? "true" : undefined} />;
  },
}));

// next/link renders as a plain <a> in the test environment
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const product = {
  id: "peasemarsh",
  title: "Peasemarsh",
  price: 99,
  onSale: true,
  image: "/paintings/peasemarsh.jpg",
  category: "Grey Highlands",
  sizeType: "landscape" as const,
};

describe("ProductCard", () => {
  it("renders the product title", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText("Peasemarsh")).toBeDefined();
  });

  it("renders the starting price", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText(/CA\$99\.00/)).toBeDefined();
  });

  it("links to /products/{id} by default", () => {
    render(<ProductCard product={product} />);
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.href).toContain("/products/peasemarsh");
  });

  it("links to a custom basePath when provided", () => {
    render(<ProductCard product={product} basePath="/photographs" />);
    const link = screen.getByRole("link") as HTMLAnchorElement;
    expect(link.href).toContain("/photographs/peasemarsh");
  });

  it("renders the product image with the correct alt text", () => {
    render(<ProductCard product={product} />);
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.alt).toBe("Peasemarsh");
  });
});

describe("ProductCard: sold out", () => {
  const sold = { ...product, isNew: true, soldOut: true };

  it("shows a price for work that is still for sale", () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText(/from CA\$99/)).toBeTruthy();
  });

  it("replaces the price with Sold out", () => {
    // "from CA$99" on a card nobody can order from is an offer the site
    // cannot honour — the whole point of the state.
    render(<ProductCard product={sold} />);
    expect(screen.queryByText(/from CA\$/)).toBeNull();
    expect(screen.getAllByText("Sold out").length).toBeGreaterThan(0);
  });

  it("drops the New and Sale badges rather than stacking them", () => {
    // A card badged both "New" and "Sold out" reads as a bug.
    render(<ProductCard product={sold} />);
    expect(screen.queryByText("New")).toBeNull();
    expect(screen.queryByText("Sale")).toBeNull();
  });

  it("still links through to the work's page", () => {
    // The page stays up: it holds the search ranking and offers the enquiry.
    render(<ProductCard product={sold} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/products/peasemarsh");
  });
});

describe("ProductCard image priority", () => {
  it("loads lazily unless asked, and eagerly for a card at the top of the page", () => {
    const { rerender } = render(<ProductCard product={product} />);
    expect(screen.getByRole("img").getAttribute("data-priority")).toBeNull();
    rerender(<ProductCard product={product} priority />);
    expect(screen.getByRole("img").getAttribute("data-priority")).toBe("true");
  });
});

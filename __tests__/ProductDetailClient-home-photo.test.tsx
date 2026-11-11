import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Product } from "@/data/products";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill: _fill, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));
vi.mock("next/link", () => ({
  default: ({ children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...rest}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
// Everything below is beside the point here, and some of it (the map) needs a
// real browser to load at all.
vi.mock("@/components/LocationMap", () => ({ default: () => null }));
vi.mock("@/components/MakingOfVideo", () => ({ default: () => null }));
vi.mock("@/components/BuyNowButton", () => ({ default: () => null }));
vi.mock("@/components/SoldOutPanel", () => ({ default: () => null }));
vi.mock("@/components/ProductCard", () => ({ default: () => null }));
vi.mock("../app/products/[id]/RoomView", () => ({ default: () => null }));

import ProductDetailClient from "../app/products/[id]/ProductDetailClient";

afterEach(cleanup);

/**
 * A collector's credit is the condition their photo is shown on. It was shown
 * under the photo on the page and dropped the moment the photo was enlarged —
 * the lightbox, the largest view of it anywhere, had no credit and described
 * the picture as just the painting's title.
 */
const painting = (over: Partial<Product> = {}): Product => ({
  id: "lora-bay",
  title: "Lora Bay",
  price: 119,
  onSale: false,
  soldOut: true,
  image: "/paintings/lora-bay.jpg",
  category: "Georgian Bay",
  sizeType: "landscape",
  homePhoto: "https://blob.example/homes/lora-bay-abc.jpg",
  homePhotoCredit: "Gino C.",
  ...over,
});

const CREDIT = "Photo courtesy of Gino C.";
const ALT = "Lora Bay hanging in a collector's home";

function openCollectorsPhotoLarge() {
  fireEvent.click(screen.getByRole("button", { name: "View in a collector's home" }));
  fireEvent.click(screen.getByRole("button", { name: "Enlarge image of Lora Bay" }));
}

describe("a collector's photo, enlarged", () => {
  it("keeps the collector's credit", () => {
    render(<ProductDetailClient product={painting()} related={[]} />);
    openCollectorsPhotoLarge();
    // Once under the page image, once in the lightbox.
    expect(screen.getAllByText(CREDIT)).toHaveLength(2);
  });

  it("is still described as a photo of a collector's home", () => {
    render(<ProductDetailClient product={painting()} related={[]} />);
    openCollectorsPhotoLarge();
    // The page image and the lightbox image, both.
    expect(screen.getAllByAltText(ALT)).toHaveLength(2);
  });

  it("shows no credit line when the collector asked not to be named", () => {
    render(<ProductDetailClient product={painting({ homePhotoCredit: undefined })} related={[]} />);
    openCollectorsPhotoLarge();
    expect(screen.queryByText(/Photo courtesy of/)).toBeNull();
  });

  it("does not carry the credit onto the painting itself", () => {
    // The credit belongs to their photograph, not to the artist's work.
    render(<ProductDetailClient product={painting()} related={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Enlarge image of Lora Bay" }));
    expect(screen.queryByText(CREDIT)).toBeNull();
  });
});

/**
 * The "In a Room" mockup once the catalogue lives on Blob. The page used to
 * find it by testing for a /paintings/ path, which a migrated painting no
 * longer has, so its room view would silently fall back to the CSS composite.
 */
describe("the room mockup", () => {
  const BLOB = "https://x.public.blob.vercel-storage.com/catalogue";
  const roomImage = () => {
    fireEvent.click(screen.getByRole("button", { name: "View in a room" }));
    return screen.getAllByAltText("Lora Bay shown in a room")[0]!;
  };

  it("is the Blob copy for a migrated painting", () => {
    render(
      <ProductDetailClient
        product={painting({
          homePhoto: undefined,
          image: `${BLOB}/paintings/lora-bay.jpg`,
          mockupImage: `${BLOB}/mockups/lora-bay.jpg`,
        })}
        related={[]}
      />
    );
    expect(roomImage().getAttribute("src")).toBe(`${BLOB}/mockups/lora-bay.jpg`);
  });

  it("falls back to the CSS room view when a painting has none (every admin upload)", () => {
    render(<ProductDetailClient product={painting({ homePhoto: undefined })} related={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "View in a room" }));
    // No /mockups/<id>.jpg guess: those files are no longer served.
    expect(screen.queryAllByAltText("Lora Bay shown in a room")).toHaveLength(0);
    expect(document.querySelector('img[src^="/mockups/"]')).toBeNull();
  });
});

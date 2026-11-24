import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import CommissionExamples, { type PublicExample } from "../app/commissions/CommissionExamples";

afterEach(cleanup);

// next/image renders as a plain <img> in the test environment
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; blurDataURL?: string }) => {
    const { fill: _fill, blurDataURL: _blur, placeholder: _p, ...rest } = props as typeof props & { placeholder?: string };
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const base: PublicExample = {
  id: "c1",
  kind: "pet",
  name: "Bailey",
  subject: "Golden retriever",
  medium: "Oil on canvas",
  size: "12 x 16 in",
  image: "/media/commissions/bailey.jpg",
  blurDataURL: null,
};

const FILM = "https://store.public.blob.vercel-storage.com/commissions/duncan-making-of.mp4";
const POSTER = "https://store.public.blob.vercel-storage.com/commissions/duncan-poster.jpg";
const duncan: PublicExample = {
  ...base,
  id: "c2",
  name: "Duncan",
  subject: "Australian shepherd puppy",
  size: "16 x 22 in",
  image: "/media/commissions/duncan.jpg",
  filmUrl: FILM,
  filmPosterUrl: POSTER,
};

describe("CommissionExamples", () => {
  it("shows an example without a film as its image and caption", () => {
    const { container } = render(<CommissionExamples examples={[base]} />);
    expect(screen.getByAltText("Commissioned painting of Bailey, golden retriever")).toBeTruthy();
    expect(screen.getByText("Bailey, Golden retriever, Oil on canvas, 12 x 16 in")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Play the film of/ })).toBeNull();
    expect(container.querySelector("li")?.className ?? "").not.toContain("col-span-2");
  });

  it("shows an example with a film as the film, two columns wide, with no <video> until played", () => {
    const { container } = render(<CommissionExamples examples={[base, duncan]} />);
    const play = screen.getByRole("link", { name: "Play the film of Duncan" });
    expect(play.getAttribute("href")).toBe(FILM);
    // The still is the finished painting; nothing heavy loads before play.
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector(`img[src="${POSTER}"]`)).toBeTruthy();
    // Its own cropped image is not shown as well.
    expect(container.querySelector('img[src="/media/commissions/duncan.jpg"]')).toBeNull();
    expect(play.closest("li")?.className).toContain("sm:col-span-2");
    expect(screen.getByText(/Duncan, Australian shepherd puppy, Oil on canvas, 16 x 22 in\. Press play/)).toBeTruthy();
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import MakingOfVideo, { type MakingOfFilm } from "../components/MakingOfVideo";
import { posterSizes } from "../data/making-of-poster-sizes";

afterEach(cleanup);

// next/image renders as a plain <img> in the test environment
vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
    const { fill: _fill, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const film: MakingOfFilm = {
  id: "manitoulin-island",
  title: "Manitoulin Island",
  videoUrl: "https://blob.example.com/making-of/faststart/manitoulin-island-v2.mp4",
  posterUrl: "https://blob.example.com/making-of/manitoulin-island-v2-poster.jpg",
  description: "The long view over the North Channel.",
  seconds: 56,
  productId: "manitoulin-island",
};

const facade = () => screen.getByRole("link", { name: /Play the film of/ });

describe("MakingOfVideo", () => {
  it("puts no <video> on the page until the film is asked for", () => {
    const { container } = render(<MakingOfVideo film={film} />);

    // The whole point: neither the 10-30MB film nor a full-size poster should
    // cross the wire on load. /making-of renders 22 of these at once.
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("source")).toBeNull();
    expect(facade()).toBeDefined();
  });

  it("serves the still through the image optimiser, not straight off Blob", () => {
    const { container } = render(<MakingOfVideo film={film} />);
    const img = container.querySelector("img")!;

    // next/image is mocked to a bare <img>, so src is the raw value the
    // component handed it — the optimiser rewrite is next/image's job. What
    // matters here is that the component passes the Blob URL to next/image
    // rather than dropping it into markup itself.
    expect(img.getAttribute("src")).toBe(film.posterUrl);
    expect(img.getAttribute("sizes")).toBe("(max-width: 768px) 100vw, 768px");
  });

  it("reserves the film's real shape so the page doesn't jump", () => {
    const { container } = render(<MakingOfVideo film={film} />);
    const img = container.querySelector("img")!;
    const measured = posterSizes["manitoulin-island"];

    expect(img.getAttribute("width")).toBe(String(measured!.width));
    expect(img.getAttribute("height")).toBe(String(measured!.height));
  });

  it("falls back to 4:3 for a film nobody has measured", () => {
    const { container } = render(
      <MakingOfVideo film={{ ...film, id: "not-measured-yet" }} />
    );
    const img = container.querySelector("img")!;

    expect(img.getAttribute("width")).toBe("1920");
    expect(img.getAttribute("height")).toBe("1440");
  });

  it("mounts the player, already playing, once the facade is clicked", () => {
    const { container } = render(<MakingOfVideo film={film} />);
    fireEvent.click(facade());

    const el = container.querySelector("video")!;
    expect(el).not.toBeNull();
    expect(el.hasAttribute("autoplay")).toBe(true);
    expect(el.querySelector("source")?.getAttribute("src")).toBe(film.videoUrl);
    // The facade is gone — one player, not a player behind a poster.
    expect(screen.queryByRole("link", { name: /Play the film of/ })).toBeNull();
  });

  it("routes the player's own poster through the optimiser", () => {
    const { container } = render(<MakingOfVideo film={film} />);
    fireEvent.click(facade());

    const poster = container.querySelector("video")!.getAttribute("poster")!;
    // A raw Blob URL here is the bug this component was changed to fix: the
    // poster is fetched whatever `preload` says, so it has to be optimised.
    expect(poster).not.toBe(film.posterUrl);
    expect(poster.startsWith("/_next/image?url=")).toBe(true);
    expect(poster).toContain(encodeURIComponent(film.posterUrl!));
  });

  it("still links to the file, so it does something with JavaScript off", () => {
    render(<MakingOfVideo film={film} />);
    expect(facade().getAttribute("href")).toBe(film.videoUrl);
  });

  it("leaves modified clicks to the browser", () => {
    const { container } = render(<MakingOfVideo film={film} />);
    // ⌘-click means "open the file", the way it would on any other link.
    fireEvent.click(facade(), { metaKey: true });
    expect(container.querySelector("video")).toBeNull();
  });

  it("shows the heading, runtime and description", () => {
    render(<MakingOfVideo film={film} />);
    expect(screen.getByRole("heading", { name: "How it was made" })).toBeDefined();
    expect(screen.getByText("56 seconds")).toBeDefined();
    expect(screen.getByText(film.description!)).toBeDefined();
  });

  it("formats a runtime over a minute as m:ss", () => {
    render(<MakingOfVideo film={{ ...film, seconds: 95 }} />);
    expect(screen.getByText("1:35")).toBeDefined();
  });

  it("omits the heading block when heading is null", () => {
    render(<MakingOfVideo film={film} heading={null} />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("survives a film with no poster, description or runtime", () => {
    const { container } = render(
      <MakingOfVideo film={{ ...film, posterUrl: null, description: null, seconds: null }} />
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("No still yet")).toBeDefined();
    expect(screen.queryByText(/seconds/)).toBeNull();

    // Still playable — a missing still must not cost you the film.
    fireEvent.click(facade());
    const el = container.querySelector("video")!;
    expect(el.hasAttribute("poster")).toBe(false);
    expect(el.querySelector("source")?.getAttribute("src")).toBe(film.videoUrl);
  });
});

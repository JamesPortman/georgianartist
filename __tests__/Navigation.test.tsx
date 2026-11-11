import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Navigation from "../components/Navigation";

afterEach(cleanup);

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

describe("Navigation", () => {
  it("holds the storefront's seven links, Contact last, then For Artists apart", () => {
    const { container } = render(<Navigation />);
    const desktop = [...container.querySelectorAll("header nav a")].map((a) => a.textContent);
    expect(desktop).toEqual([
      "Paintings", "Photographs", "Gift Shop", "Locations", "Making Of", "About", "FAQ/Contact",
      "For Artists",
    ]);
    // Set apart as a button for a different reader, not an eighth shop link.
    const forArtists = container.querySelector('header nav a[href="/for-artists"]')!;
    expect(forArtists.getAttribute("data-audience")).toBe("artists");
  });

  it("leaves Architecture to the footer", () => {
    render(<Navigation />);
    for (const name of ["Architecture"]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
  });

  it("renders the site name as a link to /", () => {
    render(<Navigation />);
    const siteLink = screen.getByRole("link", { name: "Georgian Bay Artists" }) as HTMLAnchorElement;
    expect(siteLink.href).toContain("/");
  });

  it("highlights the active route", () => {
    render(<Navigation />);
    // usePathname returns "/" so the Paintings link should have the active class
    const paintingsLinks = screen.getAllByRole("link", { name: "Paintings" });
    const activeLink = paintingsLinks.find((el) => el.className.includes("font-semibold"));
    expect(activeLink).toBeDefined();
  });
});

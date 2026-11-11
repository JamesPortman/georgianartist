import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

// Which pages get the sale banner, the nav and the footer. /architecture keeps
// the nav and footer but not the banner: a technical write-up with "save up to
// 35% on prints" above it reads as noise. /admin and /book have their own chrome.

const path = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

const { default: StorefrontChrome } = await import("@/components/StorefrontChrome");

function shown(pathname: string) {
  path.current = pathname;
  const { queryByTestId } = render(
    <StorefrontChrome
      banner={<div data-testid="banner" />}
      header={<nav data-testid="nav" />}
      footer={<footer data-testid="footer" />}
    >
      <p>page</p>
    </StorefrontChrome>
  );
  return {
    banner: !!queryByTestId("banner"),
    nav: !!queryByTestId("nav"),
    footer: !!queryByTestId("footer"),
  };
}

afterEach(cleanup);

describe("StorefrontChrome", () => {
  it.each(["/", "/photographs", "/products/lora-bay", "/contact", "/for-artists", "/architectures"])(
    "shows the banner, nav and footer on %s",
    (p) => {
      expect(shown(p)).toEqual({ banner: true, nav: true, footer: true });
    }
  );

  it.each(["/architecture", "/architecture/tests"])("drops only the banner on %s", (p) => {
    expect(shown(p)).toEqual({ banner: false, nav: true, footer: true });
  });

  it.each(["/admin", "/admin/analytics", "/book"])("drops all of it on %s", (p) => {
    expect(shown(p)).toEqual({ banner: false, nav: false, footer: false });
  });
});

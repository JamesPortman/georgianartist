import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  pathname.value = "/";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sentPaths = () =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).path);

/**
 * A 404 renders inside the root layout, so the tracker fired for it like any
 * other page. Dead inbound links from the old Squarespace site became 642
 * "pageviews" from 642 distinct "visitors" — 37% of the table, 448 of them on
 * one URL for a painting that no longer exists. Recorded as pageviews they
 * inflate views and unique visitors alike, and look exactly like real traffic
 * that never engages.
 */
describe("AnalyticsTracker", () => {
  it("records a pageview for a real page", async () => {
    const { default: AnalyticsTracker } = await import("../components/AnalyticsTracker");
    pathname.value = "/products/scenic-caves";
    render(<AnalyticsTracker />);
    expect(sentPaths()).toEqual(["/products/scenic-caves"]);
  });

  it("does not record a pageview when the 404 page marked the path", async () => {
    const mod = await import("../components/AnalyticsTracker");
    pathname.value = "/home/p/lone-tree";
    // Tree order: {children} — where the 404 lives — renders before the
    // sibling tracker, and React flushes passive effects in that order, so the
    // beacon's effect always sets the flag before the tracker reads it.
    render(
      <>
        <mod.NotFoundBeacon />
        <mod.default />
      </>
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still records the next real page after a 404", async () => {
    const mod = await import("../components/AnalyticsTracker");
    pathname.value = "/home/p/lone-tree";
    const { unmount } = render(
      <>
        <mod.NotFoundBeacon />
        <mod.default />
      </>
    );
    expect(fetchMock).not.toHaveBeenCalled();
    unmount();

    pathname.value = "/photographs";
    render(<mod.default />);
    expect(sentPaths()).toEqual(["/photographs"]);
  });

  it("never records admin paths", async () => {
    const { default: AnalyticsTracker } = await import("../components/AnalyticsTracker");
    pathname.value = "/admin/analytics";
    render(<AnalyticsTracker />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

/**
 * The browser half of error reporting: what it sends, and what it leaves out.
 * Each test gets a fresh module, since the reporter remembers what it has sent.
 */

let fetchMock: ReturnType<typeof vi.fn>;
const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

async function load() {
  vi.resetModules();
  return import("../components/ClientErrorReporter");
}

// The ErrorEvents dispatched below are handled, not thrown: without this jsdom
// reports each one as uncaught, and Vitest fails the run.
const handled = (e: ErrorEvent) => e.preventDefault();

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  window.addEventListener("error", handled);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.removeEventListener("error", handled);
});

describe("reportClientError", () => {
  it("posts the error with this page's path and its kind", async () => {
    const { reportClientError } = await load();
    reportClientError(new TypeError("x is undefined"), "browser (page)");
    expect(fetchMock).toHaveBeenCalledWith("/api/client-error", expect.objectContaining({ method: "POST", keepalive: true }));
    expect(sentBodies()[0]).toMatchObject({ name: "TypeError", message: "x is undefined", path: location.pathname, kind: "browser (page)" });
  });

  it("skips an error with a digest: the server reported it already", async () => {
    const { reportClientError } = await load();
    reportClientError(Object.assign(new Error("server"), { digest: "123" }), "browser (page)");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends each error once, and at most five per page load", async () => {
    const { reportClientError } = await load();
    reportClientError(new Error("same"), "browser (event)");
    reportClientError(new Error("same"), "browser (event)");
    for (let i = 0; i < 10; i++) reportClientError(new Error(`e${i}`), "browser (event)");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("never throws, even if the network call does", async () => {
    fetchMock.mockImplementation(() => {
      throw new Error("offline");
    });
    const { reportClientError } = await load();
    expect(() => reportClientError("a string", "browser (event)")).not.toThrow();
  });
});

describe("ClientErrorReporter", () => {
  const fire = (init: ErrorEventInit) => window.dispatchEvent(new ErrorEvent("error", { cancelable: true, ...init }));

  it("reports an uncaught error from this site's own script", async () => {
    const { default: Reporter } = await load();
    render(<Reporter />);
    fire({ message: "boom", filename: `${location.origin}/_next/static/chunks/app.js`, error: new Error("boom") });
    expect(sentBodies()).toMatchObject([{ message: "boom", kind: "browser (event)" }]);
  });

  it("ignores another origin's script: an extension's or an embed's", async () => {
    const { default: Reporter } = await load();
    render(<Reporter />);
    const err = new Error("theirs");
    err.stack = "Error: theirs\n    at https://www.googletagmanager.com/gtag/js:1:1";
    fire({ message: "theirs", filename: "https://www.googletagmanager.com/gtag/js", error: err });
    fire({ message: "Script error.", filename: "" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a rejected promise only when its stack is this site's", async () => {
    const { default: Reporter } = await load();
    render(<Reporter />);
    const mine = new Error("mine");
    mine.stack = `Error: mine\n    at ${location.origin}/_next/static/chunks/x.js:1:1`;
    const reject = (reason: unknown) => {
      const e = new Event("unhandledrejection") as PromiseRejectionEvent;
      Object.defineProperty(e, "reason", { value: reason });
      window.dispatchEvent(e);
    };
    reject(mine);
    reject(new Error("elsewhere"));
    reject("not an error");
    expect(sentBodies()).toMatchObject([{ message: "mine", kind: "browser (promise)" }]);
  });

  it("stops listening when unmounted", async () => {
    const { default: Reporter } = await load();
    const { unmount } = render(<Reporter />);
    unmount();
    fire({ message: "late", filename: `${location.origin}/_next/x.js`, error: new Error("late") });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

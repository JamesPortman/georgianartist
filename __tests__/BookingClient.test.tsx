import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import BookingClient from "../app/book/BookingClient";
import { MIN_SUBMIT_MS } from "../lib/booking";

/**
 * The time-to-submit stamp is half of the booking form's invisible spam check
 * (the honeypot is the other half), and it breaks silently: the request still
 * sends, the reply still arrives, and only the gate stops working. booking.test
 * covers the server's half of the bargain — this covers the client's.
 */
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sentBody = () => JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);

async function fillAndSubmit() {
  // Only name and email are required; the browser blocks submit without them.
  fireEvent.change(document.querySelector("#bk-name")!, { target: { value: "Ada" } });
  fireEvent.change(document.querySelector("#bk-email")!, { target: { value: "a@b.ca" } });
  fireEvent.submit(document.querySelector("form")!);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}

describe("BookingClient", () => {
  it("sends a numeric elapsedMs measured from mount", async () => {
    render(<BookingClient />);
    await fillAndSubmit();

    const { elapsedMs } = sentBody();
    expect(typeof elapsedMs).toBe("number");
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the honeypot field so the server can read it", async () => {
    render(<BookingClient />);
    await fillAndSubmit();

    // An empty string is the honest "a human left it alone" value. Dropping the
    // field entirely would also pass, but only by accident.
    expect(sentBody().website).toBe("");
  });

  it("measures from mount, so an immediate submit is still under the bot threshold", async () => {
    render(<BookingClient />);
    await fillAndSubmit();

    // A script that fills and fires the moment the form exists must still look
    // fast. If the stamp ever drifted to page-load or module-eval time this
    // would creep upward and the gate would stop catching anything.
    expect(sentBody().elapsedMs).toBeLessThan(MIN_SUBMIT_MS);
  });
});

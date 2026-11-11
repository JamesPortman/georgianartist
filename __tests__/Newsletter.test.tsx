import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import Newsletter from "../components/Newsletter";

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Newsletter", () => {
  it("renders the signup form", () => {
    render(<Newsletter />);
    expect(screen.getByRole("heading", { name: /new paintings/i })).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /subscribe/i })).toBeDefined();
  });

  it("does not show the confirmation before submission", () => {
    render(<Newsletter />);
    expect(screen.queryByText(/check your email to confirm/i)).toBeNull();
  });

  it("shows a confirmation after the form is submitted", async () => {
    render(<Newsletter />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /subscribe/i }).closest("form")!
    );
    await waitFor(() =>
      expect(screen.getByText(/check your email to confirm/i)).toBeDefined()
    );
  });

  it("posts the email to the Kit form endpoint", async () => {
    render(<Newsletter />);
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: "test@example.com" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /subscribe/i }).closest("form")!
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("app.kit.com/forms/9541378/subscriptions"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});

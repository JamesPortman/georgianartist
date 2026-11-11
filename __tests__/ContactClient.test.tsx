import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import ContactClient from "../app/contact/ContactClient";

afterEach(cleanup);

// Mock fetch for all tests
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ContactClient", () => {
  it("renders the contact form", () => {
    render(<ContactClient />);
    expect(screen.getByRole("heading", { name: /contact us/i })).toBeDefined();
    expect(screen.getByLabelText(/name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
    expect(screen.getByLabelText(/message/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /send message/i })).toBeDefined();
  });

  it("does not show the confirmation message before submission", () => {
    render(<ContactClient />);
    expect(screen.queryByText(/message has been sent/i)).toBeNull();
  });

  it("shows a confirmation message after the form is submitted", async () => {
    render(<ContactClient />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Hello" } });
    fireEvent.submit(screen.getByRole("button", { name: /send message/i }).closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/message has been sent/i)).toBeDefined()
    );
  });

  it("hides the form after submission", async () => {
    render(<ContactClient />);
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Hello" } });
    fireEvent.submit(screen.getByRole("button", { name: /send message/i }).closest("form")!);

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /send message/i })).toBeNull()
    );
  });
});

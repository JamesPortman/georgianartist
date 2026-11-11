import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import BuyNowButton from "../components/BuyNowButton";
import type { OrderRequest } from "../lib/order";

const ORDER: OrderRequest = { kind: "print", productId: "council-beach", size: '20" × 10"' };

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BuyNowButton", () => {
  it("renders a 'Buy Now' button", () => {
    render(<BuyNowButton order={ORDER} title="Peasemarsh" sizeLabel='16" × 12"' price={99} />);
    expect(screen.getByRole("button", { name: "Buy Now" })).toBeDefined();
  });

  it("clicking Buy Now reveals the enquiry form", () => {
    render(<BuyNowButton order={ORDER} title="Council Beach" sizeLabel='20" × 10"' price={89} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));
    expect(screen.getByLabelText(/name/i)).toBeDefined();
    expect(screen.getByLabelText(/email/i)).toBeDefined();
  });

  it("form shows the product title, size and price", () => {
    render(<BuyNowButton order={ORDER} title="Council Beach" sizeLabel='20" × 10"' price={89} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));
    expect(screen.getByText(/Council Beach/)).toBeDefined();
    expect(screen.getByText(/CA\$89\.00/)).toBeDefined();
  });

  it("Cancel button hides the form and restores Buy Now", () => {
    render(<BuyNowButton order={ORDER} title="Council Beach" sizeLabel='20" × 10"' price={89} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByRole("button", { name: "Buy Now" })).toBeDefined();
  });

  it("shows confirmation after submitting the enquiry form", async () => {
    render(<BuyNowButton order={ORDER} title="Council Beach" sizeLabel='20" × 10"' price={89} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: /send enquiry/i }).closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/enquiry sent/i)).toBeDefined()
    );
  });

  it("posts the order as ids and choices, never the displayed title or price", async () => {
    // The server looks those up itself. Sending them invited the route to
    // mail back whatever text arrived — to any address, from this domain.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<BuyNowButton order={ORDER} title="Council Beach" sizeLabel='20" × 10"' price={89} />);
    fireEvent.click(screen.getByRole("button", { name: "Buy Now" }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jane@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: /send enquiry/i }).closest("form")!);

    const buyCall = () => fetchMock.mock.calls.find((c) => c[0] === "/api/buy");
    await waitFor(() => expect(buyCall()).toBeDefined());
    const body = JSON.parse(buyCall()![1].body);
    expect(body.order).toEqual(ORDER);
    expect(body).not.toHaveProperty("title");
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("sizeLabel");
  });
});

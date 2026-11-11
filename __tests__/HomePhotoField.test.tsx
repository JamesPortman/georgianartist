import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../app/admin/products/imageProcessing", () => ({
  convertAndResize: async (f: File) => f,
}));

const { default: HomePhotoField } = await import("../app/admin/products/HomePhotoField");

afterEach(cleanup);

/**
 * The admin field for a collector's photo of a painting in their home.
 *
 * The behaviour worth pinning is the removal path. It is someone else's photo
 * of their own home, and "please take it down" has to be one click that the
 * server honours — so the Remove box must exist when there is a photo, must
 * not exist when there isn't (it would post a meaningless removal), and must
 * send the field name the update action reads.
 */
describe("HomePhotoField", () => {
  it("offers an upload and a credit line on a painting with no photo yet", () => {
    const { container } = render(<HomePhotoField />);
    expect(container.querySelector('input[type="file"][name="homePhoto"]')).toBeTruthy();
    expect(container.querySelector('input[name="homePhotoCredit"]')).toBeTruthy();
  });

  it("has nothing to remove when there is no photo", () => {
    const { container } = render(<HomePhotoField />);
    expect(container.querySelector('input[name="removeHomePhoto"]')).toBeNull();
  });

  it("shows the existing photo and credit when editing", () => {
    const { container } = render(
      <HomePhotoField initialImage="https://x/homes/lone-pine.jpg" initialCredit="Gino C." />
    );
    expect(container.querySelector('img[src="https://x/homes/lone-pine.jpg"]')).toBeTruthy();
    expect((screen.getByLabelText("Credit") as HTMLInputElement).value).toBe("Gino C.");
  });

  it("can remove it in one tick, which hides the preview and the credit", () => {
    const { container } = render(
      <HomePhotoField initialImage="https://x/homes/lone-pine.jpg" initialCredit="Gino C." />
    );
    const remove = container.querySelector('input[name="removeHomePhoto"]') as HTMLInputElement;
    expect(remove).toBeTruthy();

    fireEvent.click(remove);

    expect(remove.checked).toBe(true);
    expect(container.querySelector("img")).toBeNull();
    // Disabled, so the browser doesn't submit a credit for a photo being removed.
    expect((screen.getByLabelText("Credit") as HTMLInputElement).disabled).toBe(true);
  });
});

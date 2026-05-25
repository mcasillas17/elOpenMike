import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Carousel } from "@/components/ui/Carousel";

describe("Carousel", () => {
  it("renders a dot per image and advances on Next", () => {
    render(<Carousel images={["/a.jpg", "/b.jpg", "/c.jpg"]} altPrefix="Pic" />);
    const dots = screen.getAllByRole("button", { name: /go to photo/i });
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(
      screen.getAllByRole("button", { name: /go to photo/i })[1],
    ).toHaveAttribute("aria-current", "true");
  });

  it("wraps to the last photo when Previous is clicked from the first", () => {
    render(<Carousel images={["/a.jpg", "/b.jpg", "/c.jpg"]} altPrefix="Pic" />);
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(
      screen.getAllByRole("button", { name: /go to photo/i })[2],
    ).toHaveAttribute("aria-current", "true");
  });

  it("renders nothing for an empty image list", () => {
    const { container } = render(<Carousel images={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

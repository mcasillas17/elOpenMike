import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhotoGallery } from "@/components/comedy/PhotoGallery";

describe("PhotoGallery", () => {
  it("renders an image per photo", () => {
    render(
      <PhotoGallery
        photos={[
          { src: "/images/comedy/a.jpg", alt: "Set A" },
          { src: "/images/comedy/b.jpg", alt: "Set B" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Set A" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Set B" })).toBeInTheDocument();
  });

  it("renders nothing when there are no photos", () => {
    const { container } = render(<PhotoGallery photos={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

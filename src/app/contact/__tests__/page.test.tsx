import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ContactPage from "@/app/contact/page";

describe("ContactPage", () => {
  it("renders the contact heading and form", () => {
    render(<ContactPage />);
    expect(
      screen.getByRole("heading", { name: "Contact", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });
});

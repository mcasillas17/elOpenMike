import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ContactForm } from "@/components/contact/ContactForm";
import type { ContactState } from "@/app/contact/actions";

function renderWith(result: ContactState) {
  const action = vi.fn(async () => result);
  render(<ContactForm action={action} />);
  return action;
}

describe("ContactForm", () => {
  it("renders the fields and a hidden honeypot", () => {
    renderWith({ ok: false });
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeInTheDocument();

    const honeypot = document.querySelector('input[name="company"]');
    expect(honeypot).toBeTruthy();
    expect(honeypot?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("shows a confirmation and hides the form after a successful submit", async () => {
    renderWith({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByText(/on its way/i)).toBeInTheDocument(),
    );
    // the form fields are replaced by the confirmation
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send another/i }),
    ).toBeInTheDocument();
  });

  it("returns to an empty form when 'Send another' is clicked", async () => {
    renderWith({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByText(/on its way/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /send another/i }));

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.queryByText(/on its way/i)).not.toBeInTheDocument();
  });

  it("shows an error message when submit fails", async () => {
    renderWith({
      ok: false,
      error:
        "Something went wrong sending your message. Please email me directly at micasillm@gmail.com.",
    });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByText(/email me directly/i)).toBeInTheDocument(),
    );
  });
});

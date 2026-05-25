import { describe, it, expect, vi, beforeEach } from "vitest";
import { submitContact, type ContactState } from "@/app/contact/actions";
import { sendContactEmail } from "@/lib/email";

vi.mock("@/lib/email", () => ({
  sendContactEmail: vi.fn(),
}));

const mockedSend = vi.mocked(sendContactEmail);
const initial: ContactState = { ok: false };

function fd(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

beforeEach(() => {
  mockedSend.mockReset();
});

describe("submitContact", () => {
  it("drops honeypot submissions without sending", async () => {
    const res = await submitContact(
      initial,
      fd({ company: "bot", name: "X", email: "x@y.com", message: "hi" }),
    );
    expect(res).toEqual({ ok: true });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input and does not send", async () => {
    const res = await submitContact(
      initial,
      fd({ name: "", email: "not-an-email", message: "" }),
    );
    expect(res.ok).toBe(false);
    expect(res.errors?.name).toBeTruthy();
    expect(res.errors?.email).toBeTruthy();
    expect(res.errors?.message).toBeTruthy();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("sends trimmed fields and returns ok for valid input", async () => {
    mockedSend.mockResolvedValueOnce(undefined);
    const res = await submitContact(
      initial,
      fd({ name: "  Miguel  ", email: "  me@example.com ", message: "  Hello!  " }),
    );
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend).toHaveBeenCalledWith({
      name: "Miguel",
      email: "me@example.com",
      message: "Hello!",
    });
    expect(res).toEqual({ ok: true });
  });

  it("returns a friendly error when sending throws", async () => {
    mockedSend.mockRejectedValueOnce(new Error("boom"));
    const res = await submitContact(
      initial,
      fd({ name: "Miguel", email: "me@example.com", message: "Hello!" }),
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/email me directly/i);
    expect(res.error).toMatch(/micasillm@gmail.com/);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sendContactEmail } from "@/lib/email";

describe("sendContactEmail", () => {
  const original = process.env.RESEND_API_KEY;

  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original;
  });

  it("throws when RESEND_API_KEY is not set", async () => {
    await expect(
      sendContactEmail({ name: "A", email: "a@b.com", message: "hi" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});

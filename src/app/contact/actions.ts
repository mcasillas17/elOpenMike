"use server";

import { sendContactEmail } from "@/lib/email";

export type ContactState = {
  ok: boolean;
  errors?: Partial<Record<"name" | "email" | "message", string>>;
  error?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitContact(
  _prevState: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot: a hidden field real users never fill. If it has a value,
  // treat as a bot and silently "succeed" so we don't tip it off.
  const honeypot = (formData.get("company") ?? "").toString().trim();
  if (honeypot) {
    return { ok: true };
  }

  const name = (formData.get("name") ?? "").toString().trim();
  const email = (formData.get("email") ?? "").toString().trim();
  const message = (formData.get("message") ?? "").toString().trim();

  const errors: NonNullable<ContactState["errors"]> = {};
  if (!name) errors.name = "Please enter your name.";
  else if (name.length > 100) errors.name = "Name is too long (max 100 characters).";

  if (!email) errors.email = "Please enter your email address.";
  else if (email.length > 200 || !EMAIL_RE.test(email))
    errors.email = "Please enter a valid email address.";

  if (!message) errors.message = "Please enter a message.";
  else if (message.length > 5000)
    errors.message = "Message is too long (max 5000 characters).";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  try {
    await sendContactEmail({ name, email, message });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error:
        "Something went wrong sending your message. Please email me directly at micasillm@gmail.com.",
    };
  }
}

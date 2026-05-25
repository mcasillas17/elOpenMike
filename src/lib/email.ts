import { Resend } from "resend";

export type ContactInput = {
  name: string;
  email: string;
  message: string;
};

let client: Resend | null = null;

function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set");
  }
  client ??= new Resend(key);
  return client;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendContactEmail(input: ContactInput): Promise<void> {
  const to = process.env.CONTACT_TO_EMAIL ?? "micasillm@gmail.com";
  const from = process.env.CONTACT_FROM_EMAIL ?? "contact@elopenmike.com";

  const { error } = await getClient().emails.send({
    from: `elOpenMike <${from}>`,
    to,
    replyTo: input.email,
    subject: `New message from ${input.name} via elopenmike.com`,
    text: `From: ${input.name} <${input.email}>\n\n${input.message}`,
    html:
      `<p><strong>From:</strong> ${escapeHtml(input.name)} ` +
      `&lt;${escapeHtml(input.email)}&gt;</p>` +
      `<p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to send email");
  }
}

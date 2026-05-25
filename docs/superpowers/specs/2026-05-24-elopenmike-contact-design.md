# elOpenMike Contact Form — Design Spec

> Plan 5 of the elOpenMike personal site. Builds on Plans 1–4 (live at https://elopenmike.com).

**Date:** 2026-05-24

## Goal

A dedicated `/contact` page where visitors can send Miguel a message. Submissions are delivered to his inbox via [Resend](https://resend.com), sent from a verified `elopenmike.com` address with the visitor's address as the reply-to. Bots are deterred with a hidden honeypot field — no CAPTCHA, no extra services.

## Scope

In scope:
- A `/contact` route with an on-brand page and form.
- A Server Action that validates input and sends email via Resend.
- A reusable email helper that lazily instantiates the Resend client.
- Honeypot spam protection.
- "Contact" nav item.
- Unit tests for the action (validation + honeypot + send) and the form (render + states).

Out of scope (deferred):
- Real-browser e2e tests → Plan 6 (Polish).
- Storing submissions in a database — email delivery only.
- CAPTCHA / Turnstile — honeypot is sufficient for this low-traffic personal site.
- Rate limiting — revisit only if spam becomes a problem.

## Architecture

Next.js 16 App Router. The page is a server component; the form is a client component driven by a Server Action via React 19's `useActionState`. Email delivery is isolated behind a small helper so the action stays focused on request handling and validation, and so the Resend client is only constructed at runtime when a request actually needs it (never at build time).

```
/contact (server page)
  └─ <ContactForm> (client)
        │  useActionState(submitContact)
        ▼
   submitContact  ── "use server" action
        │  honeypot check → validate → 
        ▼
   sendContactEmail()  ── src/lib/email.ts (lazy Resend client)
        ▼
     Resend API  ──▶  micasillm@gmail.com  (replyTo: visitor)
```

### Why a Server Action (not a route handler)

A Server Action gives progressive enhancement (the form posts and works without client JS), no separate endpoint or CORS handling, and end-to-end typed state via `useActionState`. This is the idiomatic Next 16 App Router approach. A route handler (`app/api/contact/route.ts`) + client `fetch` was the alternative — more boilerplate (manual JSON parsing, CORS, status codes) for no benefit here. A third-party form service (Formspree) was rejected: it adds an external dependency and surrenders styling/control we already have.

## Files

| File | Responsibility |
|------|----------------|
| `src/app/contact/page.tsx` | Route `/contact`; server-component shell (eyebrow, heading, blurb) wrapping `<ContactForm>`; exports `metadata`. |
| `src/app/contact/actions.ts` | `"use server"` `submitContact` action: honeypot drop, validation, calls `sendContactEmail`, returns typed state. |
| `src/components/contact/ContactForm.tsx` | Client form: Name/Email/Message + honeypot; `useActionState` + pending state; success/error UI. |
| `src/lib/email.ts` | `sendContactEmail({name,email,message})`; lazy Resend client from `RESEND_API_KEY`. |
| `src/lib/site.ts` | Add `{ label: "Contact", href: "/contact" }` to `nav`. |
| `.env.example` | Document `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`. |
| Tests | `src/app/contact/__tests__/actions.test.ts`, `src/components/contact/__tests__/ContactForm.test.tsx`. |

## Components & Data Flow

### `ContactForm` (client component)

Fields: **Name**, **Email**, **Message** — plus a **hidden honeypot** field named `company`.

- Honeypot: rendered visually hidden (off-screen via class, not `display:none` so some bots still see it), `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden="true"`. Real users never fill it.
- State via `const [state, formAction, isPending] = useActionState(submitContact, initialState)`.
- Submit button: label "Send" → "Sending…" while `isPending`; `disabled` while pending.
- On `state.ok === true`: show an inline success message in an `aria-live="polite"` region ("Thanks — your message is on its way. I'll get back to you soon.") and reset the fields.
- On `state.ok === false`: show `state.errors` next to the relevant fields and/or a general error message. The general-error copy includes the `mailto:micasillm@gmail.com` fallback link.
- Native UX hints: `required`, `type="email"` on the email input, `maxLength` on message. Server validation is authoritative; these are conveniences.
- Styling reuses the design system (`bg-surface`, `border-edge`, `text-ink`/`text-muted`, focus rings using `--color-web`, `font-body`; the submit button uses the existing `Button` primitive).

### `submitContact` (server action)

Signature: `submitContact(prevState: ContactState, formData: FormData): Promise<ContactState>` where
`type ContactState = { ok: boolean; errors?: Partial<Record<"name"|"email"|"message", string>>; error?: string }`.

Flow:
1. Read `name`, `email`, `message`, `company` (honeypot) from `formData` and `.trim()` strings.
2. **Honeypot:** if `company` is non-empty → return `{ ok: true }` immediately (silently drop; pretend success).
3. **Validate:**
   - `name`: required, length 1–100.
   - `email`: required, matches a basic email regex, length ≤ 200.
   - `message`: required, length 1–5000.
   - Any failures → return `{ ok: false, errors }` (no email sent).
4. Call `sendContactEmail({ name, email, message })`.
   - Success → `{ ok: true }`.
   - Throw/failure → return `{ ok: false, error: "Something went wrong sending your message. Please email me directly at micasillm@gmail.com." }`.

No new validation dependency (zod etc.): three fields with a regex + length checks are simpler inline and avoid the 7-day cooldown gate.

### `sendContactEmail` (email helper)

```ts
// src/lib/email.ts
import { Resend } from "resend";

let client: Resend | null = null;
function getClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  client ??= new Resend(key);
  return client;
}

export async function sendContactEmail(input: {
  name: string; email: string; message: string;
}): Promise<void> {
  const to = process.env.CONTACT_TO_EMAIL ?? "micasillm@gmail.com";
  const from = process.env.CONTACT_FROM_EMAIL ?? "contact@elopenmike.com";
  const { error } = await getClient().emails.send({
    from: `elOpenMike <${from}>`,
    to,
    replyTo: input.email,
    subject: `New message from ${input.name} via elopenmike.com`,
    text: `From: ${input.name} <${input.email}>\n\n${input.message}`,
    // plus a simple HTML body
  });
  if (error) throw new Error(error.message);
}
```

Lazy construction guarantees `next build` (which runs with no secrets) never touches Resend. The client is memoized across warm invocations.

## Validation & Error Handling

- **Server-authoritative** validation; the client only surfaces returned state.
- **Honeypot hit** → fake success (don't tip off bots).
- **Validation failure** → field-level `errors`, nothing sent.
- **Resend/network failure** → friendly general `error` with the direct-email fallback.
- **Missing `RESEND_API_KEY`** at runtime → the helper throws → the action returns the friendly error. The site never crashes; the form just reports it can't send until the key is configured.

## Environment & Secrets

| Var | Example | Where |
|-----|---------|-------|
| `RESEND_API_KEY` | `re_xxx` | Local `.env.local`; prod `fly secrets set` |
| `CONTACT_TO_EMAIL` | `micasillm@gmail.com` | same (has a safe default in code) |
| `CONTACT_FROM_EMAIL` | `contact@elopenmike.com` | same (has a safe default in code) |

- `.env.local` is gitignored; a committed `.env.example` documents the three vars.
- Build needs **none** of these (lazy init), so the GitHub Action's build/test jobs are unaffected.

### One-time owner setup (run when convenient)

1. Create a Resend account and an API key.
2. In Resend, **add domain `elopenmike.com`** and copy the DNS records it generates (SPF/DKIM `TXT` + `MX`/`CNAME` as shown; DMARC optional).
3. Add those records in **Cloudflare DNS** for `elopenmike.com`; wait for Resend to mark the domain **Verified**.
4. Set the Fly secrets:
   ```bash
   fly secrets set RESEND_API_KEY=re_xxx \
     CONTACT_TO_EMAIL=micasillm@gmail.com \
     CONTACT_FROM_EMAIL=contact@elopenmike.com
   ```
   (This triggers a Fly redeploy with the secrets available at runtime.)
5. For local testing, put the same vars in `.env.local`.

Until steps 1–4 are done, the form renders and validates but reports the friendly "email me directly" error on submit. This is acceptable — the build and deploy succeed regardless.

## Testing

Unit tests only (Vitest + RTL); real-browser e2e is Plan 6.

**`actions.test.ts`** (mock `@/lib/email` so Resend is never called):
- Honeypot filled → returns `{ ok: true }` and `sendContactEmail` is **not** called.
- Missing name / invalid email / empty message → `{ ok: false, errors }`, not sent.
- Valid input → calls `sendContactEmail` once with the trimmed fields, returns `{ ok: true }`.
- `sendContactEmail` throws → returns `{ ok: false, error }` (friendly fallback).

**`ContactForm.test.tsx`** (mock the action):
- Renders Name/Email/Message inputs and the honeypot (assert honeypot is present and visually hidden).
- Shows the success message when the action returns `{ ok: true }`.
- Shows an error message when the action returns `{ ok: false, error }`.

## Acceptance Criteria

- `/contact` renders an on-brand page with a working form and "Contact" appears in the nav.
- Submitting valid input sends an email via Resend (verified manually after the owner setup) and shows the success state.
- Honeypot submissions are silently dropped.
- Invalid input shows field errors without sending.
- `pnpm test` passes (existing 64 + new tests) and `pnpm run build` succeeds with no secrets present.
- No new always-on dependency beyond `resend`.

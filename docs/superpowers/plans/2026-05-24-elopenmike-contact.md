# elOpenMike Contact Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/contact` page with a working contact form that emails submissions to Miguel via Resend, with honeypot spam protection.

**Architecture:** A server-component page renders a client `ContactForm` driven by a `"use server"` Server Action (`submitContact`) through React 19's `useActionState`. The action drops honeypot hits, validates input inline (no validation library), and delegates sending to a small `sendContactEmail` helper that lazily constructs the Resend client (so `next build` with no secret never crashes). All email is mocked in tests; real delivery is verified manually after the owner configures Resend.

**Tech Stack:** Next.js 16 (App Router, TS), React 19 (`useActionState`), Tailwind CSS v4 (Midnight Web tokens), Resend SDK, Vitest + React Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-24-elopenmike-contact-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/email.ts` (create) | `sendContactEmail()`; lazy Resend client from `RESEND_API_KEY`. |
| `src/lib/email.test.ts` (create) | Unit test: throws when key unset. |
| `src/app/contact/actions.ts` (create) | `"use server"` `submitContact` action + `ContactState` type. |
| `src/app/contact/__tests__/actions.test.ts` (create) | Honeypot / validation / send / error paths (email mocked). |
| `src/components/contact/ContactForm.tsx` (create) | Client form: fields + honeypot, `useActionState`, states. |
| `src/components/contact/__tests__/ContactForm.test.tsx` (create) | Renders fields + hidden honeypot; success/error states (action mocked). |
| `src/app/contact/page.tsx` (create) | Route `/contact`; server shell + metadata wrapping the form. |
| `src/app/contact/__tests__/page.test.tsx` (create) | Renders heading + form. |
| `src/lib/site.ts` (modify) | Add `{ label: "Contact", href: "/contact" }` to `nav`. |
| `.env.example` (create) | Document the three env vars. |
| `.gitignore` (modify) | Add `!.env.example` so the example is committable (current `.env*` rule would ignore it). |
| `README.md` (modify) | Note the contact env vars under "Content to personalize". |

**Conventions to follow (already in the codebase):**
- Pages that need an `<h1>` use `<Container className="py-20">` directly with an eyebrow `<p class="… text-web">` + `<h1 class="font-display …">` (see `src/app/comedy/page.tsx`). `Section` is for home `<h2>` sections only — do NOT use it here.
- `Button` from `@/components/ui/Button` renders a `<button>` when no `href`; it forwards `type`, `disabled`, etc. Use `<Button type="submit" disabled={isPending}>`.
- Tokens: `bg-surface`, `border-edge`, `text-ink`, `text-muted`, `text-web`, `text-spidey`; focus ring `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web`; `font-display`/`font-body`. Never use `font-[family-name:...]`.
- Run tests with `pnpm test`, build with `pnpm run build`.

---

### Task 1: Email helper with lazy Resend client

**Files:**
- Create: `src/lib/email.ts`
- Test: `src/lib/email.test.ts`

- [ ] **Step 1: Add the Resend dependency**

The repo enforces a 7-day `minimumReleaseAge` cooldown (`pnpm-workspace.yaml`). Resend's latest is already older than 7 days, so this installs cleanly:

```bash
pnpm add resend
```

Expected: resend added to `package.json` dependencies and `pnpm-lock.yaml`, no `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. If that error ever appears, pin to a version published >7 days ago (e.g. `pnpm add resend@6.12.3`). Resend is pure JS — no entry needed in the `allowBuilds` allowlist.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/email.test.ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- src/lib/email.test.ts`
Expected: FAIL — cannot find module `@/lib/email`.

- [ ] **Step 4: Implement the helper**

```ts
// src/lib/email.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- src/lib/email.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/email.ts src/lib/email.test.ts
git commit -m "feat: add lazy Resend email helper for contact form"
```

---

### Task 2: `submitContact` server action

**Files:**
- Create: `src/app/contact/actions.ts`
- Test: `src/app/contact/__tests__/actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/contact/__tests__/actions.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/contact/__tests__/actions.test.ts`
Expected: FAIL — cannot find module `@/app/contact/actions`.

- [ ] **Step 3: Implement the action**

Note: with `"use server"`, every *runtime* export must be an async function. `ContactState` is a `type` (erased at compile time) and `EMAIL_RE` is module-scoped (not exported), so this file is compliant.

```ts
// src/app/contact/actions.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/contact/__tests__/actions.test.ts`
Expected: PASS (4 tests).

If the import fails because the vitest pipeline rejects the `"use server"` directive (unlikely with `@vitejs/plugin-react`), do NOT add config workarounds blindly — first confirm the failure, then move the pure validation/honeypot logic into `src/app/contact/validate.ts` (no directive), have `submitContact` call it, and point the unit tests at the helper. Prefer the direct import; it normally works because the React plugin treats the directive as an inert string.

- [ ] **Step 5: Commit**

```bash
git add src/app/contact/actions.ts src/app/contact/__tests__/actions.test.ts
git commit -m "feat: add submitContact server action with honeypot + validation"
```

---

### Task 3: `ContactForm` client component

**Files:**
- Create: `src/components/contact/ContactForm.tsx`
- Test: `src/components/contact/__tests__/ContactForm.test.tsx`

- [ ] **Step 1: Write the failing test**

The component accepts the action as an optional prop (default = real `submitContact`) so tests can inject a mock. Submitting is triggered by clicking the submit button; the mocked action ignores `FormData` and returns a fixed state.

```tsx
// src/components/contact/__tests__/ContactForm.test.tsx
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
    // honeypot lives inside an aria-hidden wrapper (not visible to users)
    expect(honeypot?.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("shows a success message after a successful submit", async () => {
    renderWith({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() =>
      expect(screen.getByText(/on its way/i)).toBeInTheDocument(),
    );
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/contact/__tests__/ContactForm.test.tsx`
Expected: FAIL — cannot find module `@/components/contact/ContactForm`.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/contact/ContactForm.tsx
"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { submitContact, type ContactState } from "@/app/contact/actions";

const initialState: ContactState = { ok: false };

type Action = (state: ContactState, formData: FormData) => Promise<ContactState>;

const inputClasses =
  "w-full rounded-lg border border-edge bg-surface px-4 py-2.5 text-ink " +
  "placeholder:text-muted focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-web";

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-spidey">
          {error}
        </p>
      )}
    </div>
  );
}

export function ContactForm({ action = submitContact }: { action?: Action }) {
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      data-testid="contact-form"
      className="mt-8 max-w-xl space-y-5 font-body"
    >
      {/* Honeypot: hidden from users; bots that fill it are dropped. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Field id="name" label="Name" error={state.errors?.name}>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={100}
          autoComplete="name"
          aria-invalid={state.errors?.name ? true : undefined}
          aria-describedby={state.errors?.name ? "name-error" : undefined}
          className={inputClasses}
        />
      </Field>

      <Field id="email" label="Email" error={state.errors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          aria-invalid={state.errors?.email ? true : undefined}
          aria-describedby={state.errors?.email ? "email-error" : undefined}
          className={inputClasses}
        />
      </Field>

      <Field id="message" label="Message" error={state.errors?.message}>
        <textarea
          id="message"
          name="message"
          required
          rows={6}
          maxLength={5000}
          aria-invalid={state.errors?.message ? true : undefined}
          aria-describedby={state.errors?.message ? "message-error" : undefined}
          className={`${inputClasses} resize-y`}
        />
      </Field>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending…" : "Send"}
      </Button>

      <div aria-live="polite" className="min-h-5">
        {state.ok && (
          <p className="text-sm text-web">
            Thanks — your message is on its way. I&rsquo;ll get back to you soon.
          </p>
        )}
        {state.error && <p className="text-sm text-spidey">{state.error}</p>}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/contact/__tests__/ContactForm.test.tsx`
Expected: PASS (3 tests). If `fireEvent.click` does not invoke the action under React 19 + jsdom, replace it with `fireEvent.submit(screen.getByTestId("contact-form"))` (same assertions).

- [ ] **Step 5: Commit**

```bash
git add src/components/contact/ContactForm.tsx src/components/contact/__tests__/ContactForm.test.tsx
git commit -m "feat: add ContactForm client component with honeypot + states"
```

---

### Task 4: `/contact` page

**Files:**
- Create: `src/app/contact/page.tsx`
- Test: `src/app/contact/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/contact/__tests__/page.test.tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/app/contact/__tests__/page.test.tsx`
Expected: FAIL — cannot find module `@/app/contact/page`.

- [ ] **Step 3: Implement the page**

```tsx
// src/app/contact/page.tsx
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ContactForm } from "@/components/contact/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Miguel Casillas.",
};

export default function ContactPage() {
  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web">
        Get in touch
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        Contact
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        Have a question, an opportunity, or just want to say hi? Drop me a
        message and I&rsquo;ll get back to you.
      </p>
      <ContactForm />
    </Container>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/app/contact/__tests__/page.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/contact/page.tsx src/app/contact/__tests__/page.test.tsx
git commit -m "feat: add /contact page"
```

---

### Task 5: Wire nav, env docs, and verify the whole build

**Files:**
- Modify: `src/lib/site.ts`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `README.md`

- [ ] **Step 1: Add the Contact nav item**

In `src/lib/site.ts`, add a final entry to the `nav` array (after Blog):

```ts
  nav: [
    { label: "Experience", href: "/#experience" },
    { label: "Projects", href: "/#projects" },
    { label: "About", href: "/#about" },
    { label: "Comedy", href: "/#comedy" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
  ] as NavItem[],
```

(The Header derives active-section ids via `href.split("#")[1] ?? ""`; `/contact` yields `""`, same as `/blog` already does, so it simply never highlights as a section. No Header changes needed.)

- [ ] **Step 2: Create `.env.example`**

```bash
# Resend transactional email — powers the /contact form (Plan 5).
# Create an API key at https://resend.com and verify the elopenmike.com domain.
RESEND_API_KEY=
# Where contact-form submissions are delivered (code defaults to this if unset).
CONTACT_TO_EMAIL=micasillm@gmail.com
# Verified Resend sender address (code defaults to this if unset).
CONTACT_FROM_EMAIL=contact@elopenmike.com
```

- [ ] **Step 3: Allow `.env.example` past `.gitignore`**

The current `.gitignore` has `.env*`, which would ignore `.env.example`. Add a negation immediately after the `.env*` line:

```
.env*
!.env.example
```

Verify it is now tracked:

Run: `git check-ignore .env.example; echo "exit=$?"`
Expected: `exit=1` (NOT ignored). And `git status --porcelain .env.example` shows it as a new file.

- [ ] **Step 4: Document env vars in README**

Under the "## Content to personalize" list in `README.md`, add:

```markdown
- `.env.local` — contact-form email delivery (see `.env.example`): `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`. In production set these as Fly secrets (`fly secrets set …`); the build needs none of them.
```

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all prior tests plus the new ones (64 existing + 9 new = 73), 0 failures. If a Header/nav test fails on the new item, update that test to match; none is expected to.

- [ ] **Step 6: Verify the production build**

Run: `pnpm run build`
Expected: exit 0. `/contact` appears in the route list. The build runs with no `RESEND_API_KEY` and must NOT error (the Resend client is lazy).

- [ ] **Step 7: Commit**

```bash
git add src/lib/site.ts .env.example .gitignore README.md
git commit -m "feat: add Contact to nav; document contact env vars"
```

---

## Owner setup (manual, after merge — not a code task)

The form ships and builds without these; until they're set, submitting shows the friendly "email me directly" error.

1. Create a Resend account + API key.
2. In Resend, add domain `elopenmike.com`; copy the DNS records it generates.
3. Add those records in Cloudflare DNS for `elopenmike.com`; wait for Resend to mark the domain **Verified**.
4. Set Fly secrets (triggers a redeploy with them available at runtime):
   ```bash
   fly secrets set RESEND_API_KEY=re_xxx \
     CONTACT_TO_EMAIL=micasillm@gmail.com \
     CONTACT_FROM_EMAIL=contact@elopenmike.com
   ```
5. For local dev, copy `.env.example` to `.env.local` and fill `RESEND_API_KEY`.
6. Verify end-to-end by submitting the live form and confirming the email arrives at micasillm@gmail.com with the visitor's address as reply-to.

---

## Plan Self-Review

- **Spec coverage:** `/contact` page + metadata (Task 4); nav item (Task 5); `ContactForm` with Name/Email/Message + honeypot + states (Task 3); `submitContact` honeypot/validation/send/error (Task 2); lazy Resend helper (Task 1); env vars + `.env.example` + gitignore + README (Tasks 1, 5); no new validation dep (inline regex); tests per spec (Tasks 1–4); e2e deferred to Plan 6. All covered.
- **Placeholders:** none — every code/step is concrete.
- **Type consistency:** `ContactState { ok; errors?; error? }` and `ContactInput { name; email; message }` are defined once and used identically across action, helper, form, and tests. `submitContact(prevState, formData)` signature matches `useActionState` usage and the test call sites. Honeypot field name `company` is consistent in form and action. Env var names match across helper, `.env.example`, and README.

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
            Thanks &mdash; your message is on its way. I&rsquo;ll get back to you soon.
          </p>
        )}
        {state.error && <p className="text-sm text-spidey">{state.error}</p>}
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState, type ReactNode, Fragment } from "react";
import { Button } from "@/components/ui/Button";
import { submitContact, type ContactState } from "@/app/contact/actions";

const initialState: ContactState = { ok: false };

const CONTACT_EMAIL = "micasillm@gmail.com";

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
        <p id={`${id}-error`} className="mt-1 text-sm text-spidey-strong">
          {error}
        </p>
      )}
    </div>
  );
}

// Outer wrapper holds a remount key so "Send another" resets useActionState
// (no built-in reset) by mounting a fresh inner form with empty fields.
export function ContactForm({ action = submitContact }: { action?: Action }) {
  const [formKey, setFormKey] = useState(0);
  return (
    <ContactFormInner
      key={formKey}
      action={action}
      onReset={() => setFormKey((k) => k + 1)}
    />
  );
}

function ContactFormInner({
  action,
  onReset,
}: {
  action: Action;
  onReset: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  // On success, replace the form with a confirmation. "Send another" remounts
  // a fresh form via the parent's key.
  if (state.ok) {
    return (
      <div
        role="status"
        className="mx-auto mt-8 max-w-xl rounded-lg border border-edge bg-surface p-6 text-left font-body"
      >
        <p className="font-display text-lg font-semibold text-ink">
          Message sent
        </p>
        <p className="mt-2 text-sm text-muted">
          Thanks &mdash; your message is on its way. I&rsquo;ll get back to you
          soon.
        </p>
        <div className="mt-5">
          <Button type="button" variant="secondary" onClick={onReset}>
            Send another message
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      data-testid="contact-form"
      className="mx-auto mt-8 max-w-xl space-y-5 text-left font-body"
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
        {state.error && (
          <p className="text-sm text-spidey-strong">
            {state.error.split(CONTACT_EMAIL).map((part, i, arr) => (
              <Fragment key={i}>
                {part}
                {i < arr.length - 1 && (
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="underline hover:text-ink"
                  >
                    {CONTACT_EMAIL}
                  </a>
                )}
              </Fragment>
            ))}
          </p>
        )}
      </div>
    </form>
  );
}

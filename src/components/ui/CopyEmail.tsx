"use client";

import { useState } from "react";

export function CopyEmail({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  async function copy() {
    setState("copying");
    try {
      await navigator.clipboard.writeText(email);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="js-only">
      <button
        type="button"
        disabled={state === "copying"}
        aria-busy={state === "copying"}
        onClick={copy}
        className="pressable inline-flex min-h-11 items-center rounded border border-edge px-4 text-sm font-semibold text-ink hover:border-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web disabled:cursor-wait disabled:opacity-60"
      >
        {state === "copied" ? "Copied" : state === "error" ? "Try copy again" : state === "copying" ? "Copying…" : "Copy email"}
      </button>
      {(state === "copied" || state === "error") && (
        <p role="status" className={state === "error" ? "mt-2 text-sm text-spidey-strong" : "sr-only"}>
          {state === "copied" ? "Email address copied." : "Could not copy. Select the address and copy it manually."}
        </p>
      )}
    </div>
  );
}

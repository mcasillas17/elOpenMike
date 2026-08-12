"use client";

export function SpideyTrigger() {
  return (
    <button
      type="button"
      aria-label="Toggle web-slinger mode"
      onClick={() => window.dispatchEvent(new CustomEvent("spidey:toggle"))}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded opacity-30 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
    >
      <span aria-hidden="true">🕷️</span>
    </button>
  );
}

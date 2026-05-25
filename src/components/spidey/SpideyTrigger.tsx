"use client";

export function SpideyTrigger() {
  return (
    <button
      type="button"
      aria-label="Toggle web-slinger mode"
      onClick={() => window.dispatchEvent(new CustomEvent("spidey:toggle"))}
      className="opacity-30 transition-opacity hover:opacity-100"
    >
      <span aria-hidden="true">🕷️</span>
    </button>
  );
}

import type { ReactNode } from "react";

// Small pill label used for project tags.
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-edge px-2.5 py-0.5 text-xs text-muted">
      {children}
    </span>
  );
}

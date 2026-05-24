"use client";

import { useEffect, useState } from "react";

/**
 * Returns the id of the section currently in view, for nav highlighting.
 * Pass the ids (without "#") of the sections to track.
 */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? "");
  // Stable primitive dep so the effect doesn't re-run when callers pass a new
  // array reference on every render.
  const key = ids.join(",");

  useEffect(() => {
    const sectionIds = key ? key.split(",") : [];
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return active;
}

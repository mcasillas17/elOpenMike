"use client";

import { useEffect, useState } from "react";

/**
 * Returns the id of the section currently in view, for nav highlighting.
 * Pass the ids (without "#") of the sections to track.
 */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState<string>("");
  // Stable primitive dep so the effect doesn't re-run when callers pass a new
  // array reference on every render.
  const key = ids.join(",");

  useEffect(() => {
    const sectionIds = key ? key.split(",") : [];
    const setActiveHash = () => {
      const hash = window.location.hash.slice(1);
      if (sectionIds.includes(hash)) setActive(hash);
    };

    setActiveHash();
    window.addEventListener("hashchange", setActiveHash);
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) {
      return () => window.removeEventListener("hashchange", setActiveHash);
    }

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
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", setActiveHash);
    };
  }, [key]);

  return active;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { site } from "@/lib/site";
import { useActiveSection } from "@/lib/useActiveSection";
import { Container } from "@/components/ui/Container";

export function Header() {
  const ids = site.nav.map((item) => item.href.split("#")[1] ?? "");
  const active = useActiveSection(ids);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-[#171c28]/80 bg-canvas/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link
          href="/"
          aria-label="elOpenMike — home"
          className="font-display text-lg font-extrabold"
        >
          <span className="text-web-strong">el</span>Open<span className="text-spidey">Mike</span>
        </Link>

        <nav aria-label="Site navigation" className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 sm:flex">
            {site.nav.map((item) => {
              const id = item.href.split("#")[1] ?? "";
              const isActive = active === id;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`text-sm transition-colors ${
                      isActive ? "text-web-strong" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
            className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-ink"
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </nav>
      </Container>

      {open && (
        <div id="mobile-nav" className="sm:hidden border-t border-edge bg-canvas">
          <Container className="py-3">
            <ul className="flex flex-col gap-1">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface hover:text-ink"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </Container>
        </div>
      )}
    </header>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { site, routes } from "@/lib/site";
import { useActiveSection } from "@/lib/useActiveSection";
import { Container } from "@/components/ui/Container";

export function Header() {
  const pathname = usePathname();
  const ids = site.nav
    .map((item) => item.href.split("#")[1])
    .filter((id): id is string => id !== undefined);
  const active = useActiveSection(ids);
  const [open, setOpen] = useState(false);

  function navState(href: string) {
    const id = href.split("#")[1];
    const routeActive =
      href === pathname ||
      (!href.includes("#") &&
        href !== routes.home &&
        pathname.startsWith(`${href}/`));
    const sectionActive =
      pathname === routes.home && id !== undefined && active === id;
    return { current: routeActive, active: routeActive || sectionActive };
  }

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
          href={routes.home}
          aria-label="elOpenMike — home"
          className="inline-flex min-h-11 items-center font-display text-lg font-extrabold"
        >
          <span className="text-web-strong">el</span>Open<span className="text-spidey">Mike</span>
        </Link>

        <nav aria-label="Site navigation" className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 sm:flex">
            {site.nav.map((item) => {
              const state = navState(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={state.current ? "page" : undefined}
                    className={`text-sm transition-colors ${
                      state.active
                        ? "text-web-strong"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
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
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-edge text-ink sm:hidden"
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </nav>
      </Container>

      {open && (
        <div id="mobile-nav" className="sm:hidden border-t border-edge bg-canvas">
          <Container className="py-3">
            <ul className="flex flex-col gap-1">
              {site.nav.map((item) => {
                const state = navState(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={state.current ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-11 items-center rounded-lg px-2 text-sm ${
                        state.active
                          ? "bg-surface text-web-strong"
                          : "text-muted hover:bg-surface hover:text-ink"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Container>
        </div>
      )}
    </header>
  );
}

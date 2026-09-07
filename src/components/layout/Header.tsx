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
    <header className="sticky top-0 z-50 border-b border-edge bg-canvas/95">
      <Container className="flex h-16 items-center justify-between">
        <Link
          href={routes.home}
          aria-label="elOpenMike — home"
          className="inline-flex min-h-11 items-center font-display text-lg font-extrabold"
        >
          <span className="text-web-strong">el</span>Open<span className="text-spidey">Mike</span>
        </Link>

        <nav aria-label="Site navigation" className="flex items-center gap-6">
          <ul className="hidden items-center gap-4 lg:flex">
            {site.nav.map((item) => {
              const state = navState(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={state.current ? "page" : undefined}
                    className={`inline-flex min-h-11 items-center rounded text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web ${
                      item.href === "/#contact" ? "border border-edge px-3 hover:border-web" : "px-1"
                    } ${
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
            className="inline-flex h-11 w-11 items-center justify-center rounded border border-edge text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web lg:hidden"
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </nav>
      </Container>

      {open && (
        <div id="mobile-nav" className="absolute inset-x-0 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-edge bg-canvas shadow-xl lg:hidden">
          <Container className="py-4">
            <ul className="flex flex-col divide-y divide-edge">
              {site.nav.map((item) => {
                const state = navState(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={state.current ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-11 items-center justify-between gap-4 py-3 font-display text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web ${
                        state.active
                          ? "bg-surface text-web-strong"
                          : "text-muted hover:bg-surface hover:text-ink"
                      }`}
                    >
                      {item.label}
                      <span aria-hidden="true" className="text-web-strong">↗</span>
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

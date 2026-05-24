"use client";

import { site } from "@/lib/site";
import { useActiveSection } from "@/lib/useActiveSection";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function Header() {
  const ids = site.nav.map((item) => item.href.replace("#", ""));
  const active = useActiveSection(ids);

  return (
    <header className="sticky top-0 z-50 border-b border-[#171c28]/80 bg-canvas/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <a
          href="#top"
          className="font-display text-lg font-extrabold"
        >
          {site.firstName} <span className="text-spidey">{site.lastName}</span>
        </a>

        <nav aria-label="Site navigation" className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 sm:flex">
            {site.nav.map((item) => {
              const id = item.href.replace("#", "");
              const isActive = active === id;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`text-sm transition-colors ${
                      isActive ? "text-web" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
          <Button href={site.resumeHref} download variant="secondary">
            Résumé
          </Button>
        </nav>
      </Container>
    </header>
  );
}

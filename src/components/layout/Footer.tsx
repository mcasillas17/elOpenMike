import { site, routes } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { SpideyTrigger } from "@/components/spidey/SpideyTrigger";

export function Footer() {
  return (
    <footer className="border-t border-[#171c28] py-10">
      <Container className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} {site.name}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-5">
          <li>
            <a
              href={site.resumeHref}
              download
              className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-web-strong"
            >
              Resume
            </a>
          </li>
          {site.socials.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                className="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-web-strong"
                target={s.href.startsWith("http") ? "_blank" : undefined}
                rel={s.href.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {s.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={routes.feed}
              className="inline-flex min-h-11 items-center rounded text-sm text-muted transition-colors hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
            >
              RSS
            </a>
          </li>
        </ul>
        <SpideyTrigger />
      </Container>
    </footer>
  );
}

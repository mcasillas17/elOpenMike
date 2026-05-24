import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";

export function Footer() {
  return (
    <footer className="border-t border-[#171c28] py-10">
      <Container className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} {site.name}
        </p>
        <ul className="flex gap-5">
          {site.socials.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                className="text-sm text-muted transition-colors hover:text-web"
                target={s.href.startsWith("http") ? "_blank" : undefined}
                rel={s.href.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </footer>
  );
}

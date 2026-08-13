import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { WebCorner } from "@/components/ui/WebCorner";

const linkedin = site.socials.find((s) => s.label === "LinkedIn")?.href;
const github = site.socials.find((s) => s.label === "GitHub")?.href;

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <WebCorner className="right-0 top-0" />
      <Container>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-web-strong">
          {site.role} · {site.company}
        </p>
        <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.02] sm:text-6xl">
          {site.firstName} <span className="text-spidey">{site.lastName}</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink sm:text-xl">
          {site.headline}
        </p>
        <p className="mt-3 text-muted">{site.tagline}</p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1 text-sm text-muted">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-web-strong"
          />
          {site.availability}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button href={site.resumeHref} download>
            Download résumé (PDF)
          </Button>
          <Button href={site.recruitingContact.emailHref} variant="secondary">
            Email
          </Button>
          {github && (
            <Button href={github} target="_blank" variant="secondary">
              GitHub
            </Button>
          )}
          {linkedin && (
            <Button href={linkedin} target="_blank" variant="secondary">
              LinkedIn
            </Button>
          )}
        </div>
      </Container>
    </section>
  );
}

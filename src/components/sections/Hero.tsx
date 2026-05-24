import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { WebCorner } from "@/components/ui/WebCorner";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <WebCorner className="right-0 top-0" />
      <Container>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-web">
          {site.role}
        </p>
        <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.02] sm:text-6xl">
          {site.firstName} <span className="text-spidey">{site.lastName}</span>
        </h1>
        <p className="mt-4 text-lg text-ink">{site.tagline}</p>
        <p className="mt-3 max-w-xl text-muted">{site.intro}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="#experience">View my work</Button>
          <Button href={site.resumeHref} download variant="secondary">
            Download résumé
          </Button>
        </div>
      </Container>
    </section>
  );
}

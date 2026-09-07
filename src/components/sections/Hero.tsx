import Image from "next/image";
import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { ComicButton } from "@/components/ui/comic/ComicButton";
import { WebCorner } from "@/components/ui/WebCorner";

const linkedin = site.socials.find((s) => s.label === "LinkedIn")?.href;
const github = site.socials.find((s) => s.label === "GitHub")?.href;

export function Hero() {
  return (
    <section id="top" className="comic-field relative overflow-hidden pb-8 pt-8 sm:pt-16 lg:pt-20">
      <WebCorner className="right-0 top-0 opacity-40" />
      <Container>
        <div className="relative grid items-center gap-7 lg:grid-cols-[1.3fr_1fr] lg:gap-14">
          <div>
            <p className="hidden text-sm font-medium text-web-strong lg:block">
              {site.role} · {site.company}
            </p>
            <h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              {site.firstName} <span className="text-spidey">{site.lastName}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink">
              {site.headline}
            </p>
            <p className="mt-3 text-muted">{site.tagline}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ComicButton href="/#projects">View projects →</ComicButton>
              <ComicButton href={site.resumeHref} download variant="ghost" aria-label="Download résumé (PDF)">
                <span className="sm:hidden">Résumé (PDF)</span>
                <span className="hidden sm:inline">Download résumé (PDF)</span>
              </ComicButton>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 text-sm">
              <a className="text-link" href={site.recruitingContact.emailHref}>Email</a>
              {github && <a className="text-link" href={github} target="_blank" rel="noopener noreferrer">GitHub</a>}
              {linkedin && <a className="text-link" href={linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
            </div>
          </div>
          <figure className="order-first flex items-center gap-4 lg:order-last lg:block lg:rotate-2">
            <div className="relative size-20 shrink-0 overflow-hidden border-[3px] border-panel-border shadow-panel-lg lg:aspect-square lg:h-auto lg:w-full">
              <Image
                src="/images/about/miguel.jpg"
                alt="Miguel Casillas, away from the keyboard"
                fill
                sizes="(min-width: 1024px) 380px, 80px"
                loading="eager"
                className="scale-[1.8] object-cover object-[50%_60%] lg:scale-100"
              />
            </div>
            <figcaption className="font-display text-sm font-bold text-muted lg:border-x-[3px] lg:border-b-[3px] lg:border-panel-border lg:bg-surface lg:px-5 lg:py-4 lg:text-ink lg:shadow-panel-lg">
              <span className="font-medium text-web-strong lg:hidden">
                {site.role}<span className="mt-1 block text-muted">at {site.company}</span>
              </span>
              <span className="hidden lg:inline">A little less screen time. A little more life.</span>
            </figcaption>
          </figure>
        </div>
        <p className="mt-7 flex items-start gap-2 text-sm text-muted">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-web-strong" />
          {site.availability}
        </p>
        <ul className="mt-9 flex flex-wrap gap-x-8 gap-y-3 border-t border-edge pt-5 text-xs text-muted sm:text-sm">
          <li>Microsoft since 2018</li>
          <li>{site.education}</li>
          <li>Based in {site.location}</li>
        </ul>
      </Container>
    </section>
  );
}

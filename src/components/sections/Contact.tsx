import { Container } from "@/components/ui/Container";
import { ComicButton } from "@/components/ui/comic/ComicButton";
import { site } from "@/lib/site";

export function Contact() {
  return (
    <section id="contact" aria-labelledby="contact-title" className="scroll-anchor py-16 sm:py-20">
      <Container>
        <div className="comic-field relative border-y border-edge py-12 sm:py-16">
          <div className="max-w-2xl">
            <h2 id="contact-title" className="font-display text-3xl font-extrabold leading-tight sm:text-5xl">
              Let&apos;s build something worthwhile.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              A backend challenge, a platform that needs to grow, or an interesting
              AI problem. I&apos;m open to conversations about senior engineering
              roles and the work behind them.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ComicButton href={site.recruitingContact.emailHref}>Email me ↗</ComicButton>
              <a className="text-link text-sm" href={site.resumeHref} download>Download résumé (PDF)</a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

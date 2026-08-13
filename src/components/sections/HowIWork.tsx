import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/ui/Reveal";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";
import { IssueTag } from "@/components/ui/comic/IssueTag";
import { howIWork } from "@/data/howIWork";

const EVIDENCE_LINK_CLASS =
  "relative z-10 inline-flex min-h-11 items-center font-display text-xs font-black uppercase tracking-widest text-web-strong underline decoration-web/60 underline-offset-4 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-web";

function EvidenceLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith("http")) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={EVIDENCE_LINK_CLASS}
      >
        {label} <span aria-hidden="true">↗</span>
      </a>
    );
  }

  return (
    <Link href={href} className={EVIDENCE_LINK_CLASS}>
      {label} <span aria-hidden="true">→</span>
    </Link>
  );
}

export function HowIWork() {
  return (
    <section
      id="how-i-work"
      aria-labelledby="how-i-work-title"
      className="scroll-anchor py-20"
    >
      <Container>
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
            Engineering approach
          </p>
          <h2
            id="how-i-work-title"
            className="mt-2 font-display text-3xl font-extrabold sm:text-4xl"
          >
            How I work
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            A few evidence-backed habits behind the systems and project work above.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {howIWork.map((principle) => (
              <ComicPanel
                key={principle.number}
                tint={principle.tint}
                className="min-h-64"
              >
                <IssueTag number={principle.number} label="METHOD" variant="dark" />
                <div className="relative z-10 flex h-full flex-col px-6 pb-6 pt-12 sm:px-7">
                  <h3 className="font-display text-xl font-black leading-tight sm:text-2xl">
                    {principle.title}
                  </h3>
                  <p className="mt-3 max-w-prose text-sm leading-6 text-muted sm:text-base">
                    {principle.description}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-5">
                    {principle.evidence.map((evidence) => (
                      <EvidenceLink key={evidence.href} {...evidence} />
                    ))}
                  </div>
                </div>
              </ComicPanel>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

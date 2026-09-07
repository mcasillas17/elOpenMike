import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { howIWork } from "@/data/howIWork";

const EVIDENCE_LINK_CLASS =
  "relative z-10 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-web-strong underline decoration-web/60 underline-offset-4 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-web";

function EvidenceLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith("http")) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} opens in a new tab`}
        className={EVIDENCE_LINK_CLASS}
      >
        {label}
        <span aria-hidden="true"> ↗</span>
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
    <Section id="how-i-work" eyebrow="Engineering approach" title="How I work">
      <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
        {howIWork.map((principle) => (
          <div key={principle.number} className="flex flex-col border-t border-edge pt-5">
            <h3 className="font-display text-xl font-bold leading-tight">{principle.title}</h3>
            <p className="mt-3 max-w-prose text-sm leading-6 text-muted sm:text-base">{principle.description}</p>
            <ul className="mt-auto flex flex-wrap gap-x-5 pt-3">
              {principle.evidence.map((evidence) => (
                <li key={evidence.href}><EvidenceLink {...evidence} /></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

import type { CaseStudy as CaseStudyData } from "@/data/projects";

type Props = {
  caseStudy: CaseStudyData;
};

type SectionHeadingProps = {
  id: string;
  children: React.ReactNode;
};

function SectionHeading({ id, children }: SectionHeadingProps) {
  return (
    <h2
      id={id}
      className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
    >
      {children}
    </h2>
  );
}

function ItemList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-base leading-relaxed text-ink">
          <span aria-hidden="true" className="mt-2 size-2 shrink-0 bg-spidey" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function CaseStudy({ caseStudy }: Props) {
  return (
    <div className="mt-12 space-y-12">
      <nav aria-label="Case study sections" className="flex flex-wrap gap-x-6 border-y border-edge py-2 text-sm">
        <a className="text-link" href="#case-study-problem">Overview</a>
        <a className="text-link" href="#case-study-architecture">Architecture</a>
        <a className="text-link" href="#case-study-decisions">Decisions</a>
        <a className="text-link" href="#case-study-evidence">Evidence</a>
      </nav>
      <section aria-labelledby="case-study-problem">
        <SectionHeading id="case-study-problem">Problem</SectionHeading>
        <p className="mt-4 max-w-prose text-lg leading-relaxed text-ink">{caseStudy.problem}</p>
      </section>

      <section aria-labelledby="case-study-what-i-built">
        <SectionHeading id="case-study-what-i-built">What I built</SectionHeading>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {caseStudy.whatIBuilt.map((item) => (
            <div key={item} className="border-t border-edge pt-4">
              <p className="text-base leading-relaxed text-muted">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="case-study-constraints">
        <SectionHeading id="case-study-constraints">Constraints</SectionHeading>
        <div className="mt-5 max-w-prose">
          <ItemList items={caseStudy.constraints} />
        </div>
      </section>

      <figure aria-labelledby="case-study-architecture" className="rounded border-[3px] border-panel-border bg-surface p-5 sm:p-6" style={{ boxShadow: "var(--shadow-panel-lg)" }}>
        <figcaption>
          <SectionHeading id="case-study-architecture">
            Architecture &amp; data flow
          </SectionHeading>
          <p className="mt-3 max-w-prose leading-relaxed text-muted">
            {caseStudy.architecture.flowLabel}
          </p>
        </figcaption>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2">
          {caseStudy.architecture.nodes.map((node, index) => (
            <li key={node.title} className="relative min-w-0">
              <div className="h-full border-2 border-panel-border bg-[#0e1320] p-4 text-white">
                <span className="font-mono text-xs font-bold text-web-strong">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-display text-lg font-bold leading-tight">
                  {node.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">{node.detail}</p>
              </div>
              {index < caseStudy.architecture.nodes.length - 1 && (
                <span aria-hidden="true" className="absolute -bottom-3 left-1/2 z-10 flex size-6 -translate-x-1/2 items-center justify-center bg-web font-display text-sm font-bold text-white sm:hidden">
                  ↓
                </span>
              )}
            </li>
          ))}
        </ol>
      </figure>

      <section aria-labelledby="case-study-decisions">
        <SectionHeading id="case-study-decisions">Critical decisions &amp; tradeoffs</SectionHeading>
        <div className="mt-5 divide-y divide-edge border-y border-edge">
          {caseStudy.decisions.map((decision) => (
            <div key={decision.title} className="py-5 sm:grid sm:grid-cols-[1fr_1.6fr] sm:gap-8">
              <h3 className="font-display text-lg font-bold text-ink">
                {decision.title}
              </h3>
              <p className="mt-2 max-w-prose leading-relaxed text-muted sm:mt-0">{decision.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="case-study-proof">
        <SectionHeading id="case-study-proof">Engineering proof</SectionHeading>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {caseStudy.verification.map((proof) => (
            <div key={proof.title} className="border border-edge bg-surface p-5 text-ink">
              <h3 className="font-display text-lg font-bold leading-tight">
                {proof.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed">{proof.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="case-study-evidence">
        <SectionHeading id="case-study-evidence">Evidence &amp; current status</SectionHeading>
        <aside role="note" aria-label="Current status" className="mt-5 border border-edge bg-surface p-5 sm:p-6">
          <p className="max-w-prose leading-relaxed text-ink">{caseStudy.status}</p>
        </aside>
        <h3 className="mt-6 font-display text-lg font-black uppercase tracking-wide text-ink">
          Source evidence
        </h3>
        <ul className="mt-3 divide-y divide-edge border-y border-edge">
          {caseStudy.evidence.map((evidence) => (
            <li key={evidence.href} className="py-4 sm:py-5">
              <a
                href={evidence.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center font-display text-base font-semibold text-web-strong underline underline-offset-4 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-web"
              >
                {evidence.label}
              </a>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
                {evidence.detail}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="case-study-lessons">
        <SectionHeading id="case-study-lessons">Lessons &amp; next steps</SectionHeading>
        <div className="mt-5 max-w-prose">
          <ItemList items={caseStudy.lessons} />
        </div>
      </section>
    </div>
  );
}

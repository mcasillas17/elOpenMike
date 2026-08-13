import type { CaseStudy as CaseStudyData } from "@/data/projects";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";

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
      className="font-display text-2xl font-black uppercase tracking-tight text-ink sm:text-3xl"
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
    <div className="mt-14 space-y-14">
      <section aria-labelledby="case-study-problem">
        <SectionHeading id="case-study-problem">Problem</SectionHeading>
        <ComicPanel tint="blue" className="mt-4 p-5 sm:p-6">
          <p className="relative z-10 max-w-prose text-lg leading-relaxed text-ink">
            {caseStudy.problem}
          </p>
        </ComicPanel>
      </section>

      <section aria-labelledby="case-study-what-i-built">
        <SectionHeading id="case-study-what-i-built">What I built</SectionHeading>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {caseStudy.whatIBuilt.map((item, index) => (
            <ComicPanel key={item} tint={index % 2 === 0 ? "purple" : "blue"} className="p-5">
              <p className="relative z-10 text-base leading-relaxed text-ink">{item}</p>
            </ComicPanel>
          ))}
        </div>
      </section>

      <section aria-labelledby="case-study-constraints">
        <SectionHeading id="case-study-constraints">Constraints</SectionHeading>
        <div className="mt-5 border-l-4 border-web-strong bg-surface px-5 py-5 sm:px-6">
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
        <ol className="mt-6 grid gap-3 md:grid-cols-[repeat(var(--case-study-nodes),minmax(0,1fr))]" style={{ "--case-study-nodes": caseStudy.architecture.nodes.length } as React.CSSProperties}>
          {caseStudy.architecture.nodes.map((node, index) => (
            <li key={node.title} className="relative min-w-0">
              <div className="h-full border-2 border-panel-border bg-[#0e1320] p-4 text-white">
                <span className="font-mono text-xs font-bold text-web-strong">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-display text-lg font-black uppercase leading-tight">
                  {node.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-200">{node.detail}</p>
              </div>
              {index < caseStudy.architecture.nodes.length - 1 && (
                <span aria-hidden="true" className="absolute -bottom-3 left-1/2 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border-2 border-panel-border bg-spidey font-display text-sm font-black text-white md:-right-3 md:bottom-auto md:left-auto md:top-1/2 md:-translate-y-1/2 md:translate-x-1/2">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </figure>

      <section aria-labelledby="case-study-decisions">
        <SectionHeading id="case-study-decisions">Critical decisions &amp; tradeoffs</SectionHeading>
        <div className="mt-5 space-y-3">
          {caseStudy.decisions.map((decision, index) => (
            <ComicPanel key={decision.title} tint={index % 2 === 0 ? "purple" : "blue"} className="p-5 sm:p-6">
              <h3 className="relative z-10 font-display text-xl font-black text-ink">
                {decision.title}
              </h3>
              <p className="relative z-10 mt-2 leading-relaxed text-ink">{decision.detail}</p>
            </ComicPanel>
          ))}
        </div>
      </section>

      <section aria-labelledby="case-study-proof">
        <SectionHeading id="case-study-proof">Engineering proof</SectionHeading>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {caseStudy.verification.map((proof) => (
            <div key={proof.title} className="border-2 border-panel-border bg-[#fff4bf] p-5 text-black" style={{ boxShadow: "var(--shadow-panel-sm)" }}>
              <h3 className="font-display text-lg font-black uppercase leading-tight">
                {proof.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed">{proof.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="case-study-evidence">
        <SectionHeading id="case-study-evidence">Evidence &amp; current status</SectionHeading>
        <ComicPanel tint="red" className="mt-5 p-5 sm:p-6">
          <p className="relative z-10 max-w-prose leading-relaxed text-ink">{caseStudy.status}</p>
        </ComicPanel>
        <h3 className="mt-6 font-display text-lg font-black uppercase tracking-wide text-ink">
          Source evidence
        </h3>
        <ul className="mt-3 divide-y-2 divide-panel-border border-y-2 border-panel-border">
          {caseStudy.evidence.map((evidence) => (
            <li key={evidence.href} className="bg-surface p-4 sm:p-5">
              <a
                href={evidence.href}
                target="_blank"
                rel="noreferrer"
                className="font-display text-lg font-black text-web-strong underline decoration-2 underline-offset-4 hover:text-spidey focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-web"
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
        <div className="mt-5 border-t-4 border-spidey pt-5">
          <ItemList items={caseStudy.lessons} />
        </div>
      </section>
    </div>
  );
}

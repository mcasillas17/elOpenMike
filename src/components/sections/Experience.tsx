import { experience, type Role } from "@/data/experience";
import { site } from "@/lib/site";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

function RoleHeading({ role }: { role: Role }) {
  return (
    <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
      <h3 className="font-display text-lg font-bold">
        {role.title}<span className="font-medium text-muted"> · <span>{role.company}</span></span>
        <span className="mt-1 block text-base font-medium text-web-strong">{role.focus}</span>
      </h3>
      <span className="text-sm text-muted">
        {role.start} – {role.end}{role.location ? ` · ${role.location}` : ""}
      </span>
    </div>
  );
}

function RoleDetails({ role }: { role: Role }) {
  return (
    <div className="mt-5 max-w-prose">
      <ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-ink sm:text-base sm:leading-7">
        {role.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
      </ul>
      {role.stack && role.stack.length > 0 && (
        <p className="mt-5 text-sm text-muted">{role.stack.join(" · ")}</p>
      )}
    </div>
  );
}

export function Experience() {
  const [current, ...previous] = experience;
  return (
    <Section id="experience" eyebrow="Career" title="Experience">
      <p className="mb-7 max-w-xl leading-relaxed text-muted">
        Platform work at Microsoft, from telemetry SDKs and scheduling to
        AI-powered messaging.
      </p>
      {current && (
        <div className="border border-edge bg-surface/60 p-5 sm:p-7">
          <RoleHeading role={current} />
          <RoleDetails role={current} />
        </div>
      )}
      <div className="mt-5 divide-y divide-edge border-y border-edge">
        {previous.map((role) => (
          <details key={`${role.company}-${role.start}`} className="career-details py-5">
            <summary className="flex min-h-11 cursor-pointer items-center gap-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-web">
              <RoleHeading role={role} />
              <span aria-hidden="true" className="career-toggle shrink-0 text-2xl text-web-strong motion-safe:transition-transform">+</span>
            </summary>
            <RoleDetails role={role} />
          </details>
        ))}
      </div>
      <div className="mt-7">
        <Button href={site.resumeHref} download variant="secondary">
          Download résumé (PDF)
        </Button>
        <p className="mt-2 text-sm text-muted">Resume updated August 2026</p>
      </div>
    </Section>
  );
}

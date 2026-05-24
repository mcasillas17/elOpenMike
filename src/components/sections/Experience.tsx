import { experience } from "@/data/experience";
import { site } from "@/lib/site";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export function Experience() {
  return (
    <Section id="experience" eyebrow="Career" title="Experience">
      <ol className="relative border-l border-[#2a3242] pl-6">
        {experience.map((role) => (
          <li key={`${role.company}-${role.start}`} className="mb-10 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-spidey" />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-xl font-bold">
                {role.title}
                <span className="text-muted">
                  {" · "}
                  <span>{role.company}</span>
                </span>
              </h3>
              <span className="text-sm text-muted">
                {role.start} – {role.end}
                {role.location ? ` · ${role.location}` : ""}
              </span>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
              {role.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
            {role.stack && role.stack.length > 0 && (
              <p className="mt-3 text-sm text-web">{role.stack.join(" · ")}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-10">
        <Button href={site.resumeHref} download>
          Download résumé
        </Button>
      </div>
    </Section>
  );
}

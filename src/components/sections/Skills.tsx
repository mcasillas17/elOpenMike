import { Section } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Tag";
import { skills } from "@/data/skills";

export function Skills() {
  return (
    <Section id="skills" eyebrow="Toolkit" title="Skills">
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {skills.map((group) => (
          <div key={group.label}>
            <h3 className="text-sm font-semibold text-ink">{group.label}</h3>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {group.items.map((item) => (
                <Tag key={item}>{item}</Tag>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

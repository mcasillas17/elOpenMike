import { Section } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Tag";
import { Carousel } from "@/components/ui/Carousel";
import { about } from "@/data/about";

export function About() {
  return (
    <Section id="about" eyebrow="About" title={about.headline}>
      <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr]">
        <div>
          {about.bio.map((p) => (
            <p key={p} className="mb-4 text-muted last:mb-0">
              {p}
            </p>
          ))}
          {about.facts.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {about.facts.map((f) => (
                <Tag key={f}>{f}</Tag>
              ))}
            </div>
          )}
        </div>

        <figure className="overflow-hidden rounded-2xl border border-edge bg-surface">
          {about.turing.images.length > 0 ? (
            <Carousel images={about.turing.images} altPrefix="Turing" />
          ) : (
            <div className="relative aspect-[4/3]">
              <div
                aria-hidden="true"
                className="h-full w-full"
                style={{
                  backgroundColor: "#11151f",
                  backgroundImage:
                    "radial-gradient(circle at 40% 35%, rgba(27,111,227,.35), transparent 60%), radial-gradient(circle at 70% 75%, rgba(230,36,41,.28), transparent 55%)",
                }}
              />
            </div>
          )}
          <figcaption className="px-4 py-3 text-sm text-muted">
            {about.turing.caption}
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}

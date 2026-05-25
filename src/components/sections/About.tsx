import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Tag";
import { about } from "@/data/about";

export function About() {
  const [mainImage, ...thumbnails] = about.turing.images;
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
          <div className="relative aspect-[4/3]">
            {mainImage ? (
              <Image
                src={mainImage}
                alt="Turing"
                fill
                sizes="(max-width: 640px) 100vw, 40vw"
                className="object-cover object-top"
              />
            ) : (
              <div
                aria-hidden="true"
                className="h-full w-full"
                style={{
                  backgroundColor: "#11151f",
                  backgroundImage:
                    "radial-gradient(circle at 40% 35%, rgba(27,111,227,.35), transparent 60%), radial-gradient(circle at 70% 75%, rgba(230,36,41,.28), transparent 55%)",
                }}
              />
            )}
          </div>
          {thumbnails.length > 0 && (
            <div className="grid grid-cols-2 gap-1 p-1">
              {thumbnails.map((src, i) => (
                <div key={src} className="relative aspect-[4/3]">
                  <Image
                    src={src}
                    alt={`Turing ${i + 2}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 20vw"
                    className="rounded-md object-cover"
                  />
                </div>
              ))}
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

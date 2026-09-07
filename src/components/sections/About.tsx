import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/Section";
import { Carousel } from "@/components/ui/Carousel";
import { about } from "@/data/about";
import { clips } from "@/data/comedy";
import { routes, site } from "@/lib/site";

export function About() {
  const stageClip = clips[1] ?? clips[0];
  return (
    <Section id="about" eyebrow="About" title={about.headline}>
      <div className="grid items-start gap-9 md:grid-cols-[1.4fr_1fr]">
        <div>
          {about.bio.map((p) => (
            <p key={p} className="mb-4 max-w-prose leading-relaxed text-muted last:mb-0">
              {p}
            </p>
          ))}
          <dl className="mt-6 grid gap-5 border-y border-edge py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Based in</dt>
              <dd className="mt-1 font-medium text-ink">{site.location}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Education</dt>
              <dd className="mt-1 font-medium text-ink">{site.education}</dd>
            </div>
          </dl>
          <p className="mt-6 font-display font-semibold">A few interests that show up in my work</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {about.projectInterests.map((interest) => (
              <li key={interest.slug}>
                <Link className="text-link" href={routes.projectDetail(interest.slug)}>{interest.label}</Link>
              </li>
            ))}
          </ul>
          {about.facts.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              {about.facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          )}
        </div>

        <div className="mx-auto w-full max-w-xs space-y-5">
          <figure className="overflow-hidden border-[3px] border-panel-border bg-surface shadow-panel-lg">
            {about.turing.images.length > 0 ? (
              <Carousel
                images={about.turing.images}
                altPrefix="Turing"
                aspectClassName="aspect-[3/4]"
              />
            ) : (
              <div className="relative aspect-[3/4]">
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
          {stageClip && (
            <figure className="ml-auto w-4/5 overflow-hidden border-[3px] border-panel-border bg-surface shadow-panel-lg">
              <Image
                src={stageClip.posterSrc}
                alt="Miguel performing stand-up in Seattle"
                width={1280}
                height={720}
                sizes="256px"
                className="h-auto w-full"
              />
              <figcaption className="px-4 py-3 text-sm">
                <p className="font-medium text-ink">Off the keyboard, on the mic.</p>
                <Link className="text-link mt-1" href={routes.comedy}>Watch stand-up →</Link>
              </figcaption>
            </figure>
          )}
        </div>
      </div>
    </Section>
  );
}

import { Section } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { clips } from "@/data/comedy";
import { routes } from "@/lib/site";

export function Comedy() {
  const featured = clips[0];
  return (
    <Section id="comedy" eyebrow="Comedy" title="Stand-up">
      <p className="max-w-xl leading-relaxed text-muted">
        Away from the keyboard, I write jokes and take them to the mic.
        Here&rsquo;s a featured set from Seattle.
      </p>
      {featured && (
        <div className="mt-6 max-w-2xl">
          <YouTubeEmbed
            youtubeId={featured.youtubeId}
            title={featured.title}
            posterSrc={featured.posterSrc}
          />
        </div>
      )}
      <div className="mt-8">
        <LinkButton href={routes.comedy} variant="secondary">
          Watch more →
        </LinkButton>
      </div>
    </Section>
  );
}

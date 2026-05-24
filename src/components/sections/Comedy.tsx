import { Section } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { clips } from "@/data/comedy";

export function Comedy() {
  const featured = clips[0];
  return (
    <Section id="comedy" eyebrow="Comedy" title="Stand-up">
      <p className="max-w-xl text-muted">
        Builder by day, open-mic by night. A recent set:
      </p>
      {featured && (
        <div className="mt-6 max-w-2xl">
          <YouTubeEmbed youtubeId={featured.youtubeId} title={featured.title} />
        </div>
      )}
      <div className="mt-8">
        <LinkButton href="/comedy" variant="secondary">
          Watch more →
        </LinkButton>
      </div>
    </Section>
  );
}

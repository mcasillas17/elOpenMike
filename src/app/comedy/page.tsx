import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { PhotoGallery } from "@/components/comedy/PhotoGallery";
import { clips, photos } from "@/data/comedy";
import { routes, metadataFor } from "@/lib/site";

export const metadata: Metadata = metadataFor(
  routes.comedy,
  "Comedy",
  "Stand-up clips and photos.",
);

export default function ComedyPage() {
  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Comedy
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        Stand-up
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
        Away from the keyboard, I write jokes and take them to the mic.
        These two sets are from Seattle, July 2023.
      </p>

      {clips.length > 0 && (
        <section aria-labelledby="video-archive" className="mt-12">
          <div className="border-t border-edge pt-6">
            <h2 id="video-archive" className="font-display text-2xl font-bold">
              Video archive
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              YouTube only loads when you press play. You can also watch each
              set directly on YouTube.
            </p>
          </div>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {clips.map((c) => (
              <YouTubeEmbed
                key={c.youtubeId}
                youtubeId={c.youtubeId}
                title={c.title}
                posterSrc={c.posterSrc}
              />
            ))}
          </div>
        </section>
      )}

      {photos.length > 0 && (
        <>
          <h2 className="mt-12 text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
            Photos
          </h2>
          <div className="mt-4">
            <PhotoGallery photos={photos} />
          </div>
        </>
      )}
    </Container>
  );
}

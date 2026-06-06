import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { PhotoGallery } from "@/components/comedy/PhotoGallery";
import { clips, photos } from "@/data/comedy";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Comedy",
  description: "Stand-up clips and photos.",
  alternates: { canonical: routes.comedy },
};

export default function ComedyPage() {
  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Comedy
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        Stand-up
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        A few sets and clips. Bear with the lighting — open mics aren&rsquo;t
        known for production value.
      </p>

      {clips.length > 0 && (
        <>
          <h2 className="mt-10 text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
            Clips
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {clips.map((c, i) => (
              <YouTubeEmbed
                key={`${c.youtubeId}-${i}`}
                youtubeId={c.youtubeId}
                title={c.title}
              />
            ))}
          </div>
        </>
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

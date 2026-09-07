"use client";

import Image from "next/image";
import { useState } from "react";

// Local posters (or a graphic fallback) keep YouTube unloaded until play.
export function YouTubeEmbed({
  youtubeId,
  title,
  posterSrc,
}: {
  youtubeId: string;
  title: string;
  posterSrc?: string;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <figure className="min-w-0 rounded-xl border border-edge bg-surface shadow-[4px_4px_0_0_rgba(0,0,0,0.45)]">
      <div className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-t-xl">
        {playing ? (
          <iframe
            ref={(frame) => frame?.focus()}
            className="absolute inset-0 h-full w-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
            title={title}
            loading="lazy"
            // YouTube requires a Referer; send only the origin across sites.
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play: ${title}`}
            className="group absolute inset-0 block min-h-11 min-w-11 w-full bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web"
          >
            {posterSrc ? (
              <Image
                src={posterSrc}
                alt=""
                fill
                sizes="(min-width: 1280px) 640px, (min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              <>
                <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(27,111,227,0.7),transparent_35%),radial-gradient(circle_at_75%_70%,rgba(230,36,41,0.65),transparent_40%),linear-gradient(135deg,#0e1320,#171c28)]" />
                <span aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.35)_1px,transparent_1.5px)] [background-size:8px_8px]" />
              </>
            )}
            <span aria-hidden="true" className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-white/20 bg-black/80 py-1 pr-4 pl-1 text-sm font-semibold text-white shadow-lg">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-spidey transition-colors group-hover:bg-spidey-strong">
                ▶
              </span>
              Play video
            </span>
          </button>
        )}
      </div>
      <figcaption className="border-t border-edge p-5">
        <p className="font-display text-lg leading-snug font-bold text-ink">
          {title}
        </p>
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-sm text-sm font-semibold text-web-strong underline decoration-web-strong/50 underline-offset-4 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          Watch on YouTube <span aria-hidden="true">↗</span>
          <span className="sr-only">: {title} (opens in a new tab)</span>
        </a>
      </figcaption>
    </figure>
  );
}

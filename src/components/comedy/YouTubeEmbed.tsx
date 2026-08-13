"use client";

import { useState } from "react";

// Lightweight YouTube facade: shows the thumbnail + a red play button, and only
// loads the (privacy-friendly) iframe after the user clicks. No upfront scripts.
export function YouTubeEmbed({
  youtubeId,
  title,
}: {
  youtubeId: string;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-xl border border-edge">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play: ${title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-edge bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
    >
      <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(27,111,227,0.7),transparent_35%),radial-gradient(circle_at_75%_70%,rgba(230,36,41,0.65),transparent_40%),linear-gradient(135deg,#0e1320,#171c28)]" />
      <span aria-hidden="true" className="absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.35)_1px,transparent_1.5px)] [background-size:8px_8px]" />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-spidey text-white shadow-lg transition-transform group-hover:scale-110">
          ▶
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left text-sm text-ink">
        {title}
      </span>
    </button>
  );
}

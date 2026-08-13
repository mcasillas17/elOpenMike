"use client";

import { useId, useState } from "react";
import Image from "next/image";

// A minimal, dependency-free image carousel: one slide visible, prev/next
// controls + dot indicators. Slides translate horizontally (animated only when
// motion is allowed). Returns null for an empty image list.
export function Carousel({
  images,
  altPrefix = "Photo",
  className = "",
  aspectClassName = "aspect-[4/3]",
}: {
  images: string[];
  altPrefix?: string;
  className?: string;
  aspectClassName?: string;
}) {
  const [index, setIndex] = useState(0);
  const statusId = useId();
  const count = images.length;
  if (count === 0) return null;

  const go = (to: number) => setIndex((to + count) % count);

  return (
    <div
      className={`relative ${className}`.trim()}
      role="group"
      aria-roledescription="carousel"
      aria-label={`${altPrefix} photos`}
    >
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {altPrefix} photo {index + 1} of {count}
      </p>
      <div className={`relative ${aspectClassName} overflow-hidden`}>
        <div
          className="flex h-full motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {images.map((src, i) => (
            <div
              key={src}
              className="relative h-full w-full shrink-0"
              aria-hidden={i !== index}
            >
              <Image
                src={src}
                alt={`${altPrefix} — photo ${i + 1} of ${count}`}
                fill
                sizes="(max-width: 640px) 100vw, 40vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous photo"
            aria-describedby={statusId}
            className="absolute left-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
          >
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-canvas/70 text-ink backdrop-blur transition-colors hover:bg-surface">‹</span>
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next photo"
            aria-describedby={statusId}
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
          >
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-canvas/70 text-ink backdrop-blur transition-colors hover:bg-surface">›</span>
          </button>
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to photo ${i + 1}`}
                aria-current={i === index}
                aria-describedby={statusId}
                className="group flex h-11 w-11 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
              >
                <span aria-hidden="true" className={`h-2 w-2 rounded-full transition-colors ${
                  i === index ? "bg-web-strong" : "bg-ink/40 group-hover:bg-ink/70"
                }`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

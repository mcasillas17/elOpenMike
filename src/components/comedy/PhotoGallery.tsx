import Image from "next/image";
import type { Photo } from "@/data/comedy";

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((p) => (
        <div
          key={p.src}
          className="relative aspect-square overflow-hidden rounded-lg border border-edge bg-surface"
        >
          <Image
            src={p.src}
            alt={p.alt}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

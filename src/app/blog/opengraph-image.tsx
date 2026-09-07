import { renderOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "elOpenMike writing - Notes and essays";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage({
    title: "Notes & essays",
    caption: "AI systems, distributed systems, observability, and the occasional joke.",
    label: "Writing",
  });
}

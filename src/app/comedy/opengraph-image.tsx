import { renderOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Miguel Casillas - Stand-up comedy";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage({
    title: "Away from the keyboard.",
    caption: "Stand-up clips, open mics, and the occasional laugh.",
    label: "Comedy",
  });
}

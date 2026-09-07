import { renderOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "elOpenMike projects - The Casefile";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage({
    title: "The Casefile",
    caption: "Products, developer tools, and games. Built by Miguel Casillas.",
    label: "Projects",
  });
}

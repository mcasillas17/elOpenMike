import { renderOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Miguel Casillas — Software Engineer";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage();
}

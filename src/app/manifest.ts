import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Miguel Casillas",
    short_name: "elOpenMike",
    description: "Software Engineer, builder, and stand-up comedian.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
    ],
  };
}

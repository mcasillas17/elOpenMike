import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

// Load the brand font (Sora) for the OG cards. OG images are generated at build
// time, where src/og-assets exists; if it's ever unavailable, fall back to the
// built-in font rather than crashing.
function loadFonts() {
  try {
    return [
      {
        name: "Sora",
        data: readFileSync(join(process.cwd(), "src/og-assets/sora-700.woff")),
        weight: 700 as const,
        style: "normal" as const,
      },
      {
        name: "Sora",
        data: readFileSync(join(process.cwd(), "src/og-assets/sora-800.woff")),
        weight: 800 as const,
        style: "normal" as const,
      },
    ];
  } catch {
    return undefined;
  }
}

export function renderOgImage(title?: string) {
  const fonts = loadFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0b0e14",
          backgroundImage:
            "repeating-linear-gradient(135deg, #e6242933 0 1px, transparent 1px 24px), repeating-linear-gradient(45deg, #1b6fe333 0 1px, transparent 1px 24px)",
          color: "#e8eaed",
          fontFamily: fonts ? "Sora" : undefined,
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: "#ff5a5a", fontWeight: 700 }}>
          elopenmike.com
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, marginTop: 12 }}>
          {title ?? "Miguel Casillas"}
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#9aa3b2", marginTop: 16 }}>
          {title ? "elOpenMike — the blog" : "Software Engineer · builder · stand-up comedian"}
        </div>
      </div>
    ),
    { ...ogSize, ...(fonts ? { fonts } : {}) },
  );
}

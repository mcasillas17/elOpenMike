import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_URL, site } from "@/lib/site";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

type OgOptions = {
  title?: string;
  caption?: string;
  label?: string;
};

// Local assets make build-time cards independent of font CDNs. Missing brand
// fonts should fail the build, not silently ship a different design.
const fonts = [
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

function cardText(value: string, limit: number) {
  const characters = Array.from(value.replace(/\s+/g, " ").trim());
  return characters.length > limit
    ? `${characters.slice(0, limit - 1).join("").trimEnd()}…`
    : characters.join("");
}

export function renderOgImage(options?: OgOptions) {
  const title = cardText(options?.title ?? site.name, 180);
  const caption = cardText(options?.caption ?? site.tagline, 180);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "52px 68px",
          backgroundColor: "#0b0e14",
          color: "#e8eaed",
          fontFamily: "Sora",
          borderLeft: "12px solid #e62429",
          borderBottom: "12px solid #1b6fe3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>
            el<span style={{ color: "#ff5a5a" }}>Open</span>Mike
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#9fbfff", textTransform: "uppercase", letterSpacing: 3 }}>
            {options?.label ?? "Engineer / Builder"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          <div style={{ display: "block", fontSize: title.length > 65 ? 54 : 72, lineHeight: 1.1, fontWeight: 800, lineClamp: 3, wordBreak: "break-word", overflow: "hidden" }}>
            {title}
          </div>
          <div style={{ display: "block", fontSize: 28, lineHeight: 1.4, color: "#b4bdcc", marginTop: 24, lineClamp: 2, wordBreak: "break-word", overflow: "hidden" }}>
            {caption}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid #293344", paddingTop: 22, fontSize: 22 }}>
          <span style={{ color: "#ff7474" }}>{new URL(SITE_URL).host}</span>
          <span style={{ color: "#b4bdcc" }}>{site.name}</span>
        </div>
      </div>
    ),
    { ...ogSize, fonts },
  );
}

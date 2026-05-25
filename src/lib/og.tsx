import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export function renderOgImage(title?: string) {
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
    { ...ogSize },
  );
}

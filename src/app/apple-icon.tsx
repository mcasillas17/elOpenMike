import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Branded home-screen icon (dark canvas + Spidey-red "M").
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0e14",
          color: "#e62429",
          fontSize: 120,
          fontWeight: 800,
        }}
      >
        M
      </div>
    ),
    { ...size },
  );
}

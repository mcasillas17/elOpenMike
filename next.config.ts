import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (.next/standalone) for a lean container image.
  output: "standalone",
  images: {
    // Serve images as-is. Avoids requiring `sharp` in the container (sharp's
    // build is intentionally blocked by our supply-chain allowlist). Hand-
    // optimize source images; switch to a loader/sharp later if desired.
    unoptimized: true,
  },
};

export default nextConfig;

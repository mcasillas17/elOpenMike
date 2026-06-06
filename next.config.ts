import type { NextConfig } from "next";

// Content-Security-Policy. This site is fully statically prerendered (every
// route is Static/SSG), so a nonce-based CSP is intentionally avoided — nonces
// require middleware, which forces dynamic rendering and defeats the static
// build. script-src therefore keeps 'unsafe-inline': Next.js streams hydration
// data via inline `self.__next_f.push(...)` scripts whose content varies per
// page, so neither a fixed hash nor 'self' alone can cover them. The only
// external script we load is the Cloudflare Web Analytics beacon.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  // next/font and React inline style props require inline styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Cloudflare analytics beacon reports to cloudflareinsights.com.
  "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Security headers applied to every response. See
// node_modules/next/dist/docs/.../config/next-config-js/headers.md
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server (.next/standalone) for a lean container image.
  output: "standalone",
  images: {
    // Serve images as-is. Avoids requiring `sharp` in the container (sharp's
    // build is intentionally blocked by our supply-chain allowlist). Hand-
    // optimize source images; switch to a loader/sharp later if desired.
    unoptimized: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

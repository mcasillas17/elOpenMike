import type { NextConfig } from "next";

// Content-Security-Policy. This site is fully statically prerendered (every
// route is Static/SSG), so a nonce-based CSP is intentionally avoided — nonces
// require middleware, which forces dynamic rendering and defeats the static
// build. script-src therefore keeps 'unsafe-inline': Next.js streams hydration
// data via inline `self.__next_f.push(...)` scripts whose content varies per
// page, so neither a fixed hash nor 'self' alone can cover them. The only
// external script we load is the Cloudflare Web Analytics beacon.
//
// The comedy page is the only page that reaches off-site for content, and it
// reaches to exactly two hosts (src/components/comedy/YouTubeEmbed.tsx): the
// thumbnail at https://img.youtube.com/vi/<id>/hqdefault.jpg, and — only once
// somebody clicks it — the player at https://www.youtube-nocookie.com/embed/.
// Both are named in full. `https://*.youtube.com` or the bare `youtube.com`
// would license every host Google puts behind that name, tracking endpoints
// included, which is the thing the nocookie embed is chosen to avoid; and
// neither is needed to name one thumbnail host and one player host.
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
  // next/font and React inline style props require inline styles.
  "style-src 'self' 'unsafe-inline'",
  // The facade thumbnail. No other YouTube host is drawn from: the player's own
  // images load inside its frame, under its own origin and its own policy.
  "img-src 'self' data: blob: https://img.youtube.com",
  "font-src 'self' data:",
  // Cloudflare analytics beacon reports to cloudflareinsights.com.
  "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com",
  // The player, and nothing else — not even 'self': this site frames no page of
  // its own, so leaving frame-src to fall back to default-src would have
  // allowed one for no reason.
  "frame-src https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Security headers applied to every response. See
// node_modules/next/dist/docs/.../config/next-config-js/headers.md
export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
  // A git worktree sits below the primary checkout, whose lockfile otherwise
  // wins automatic root detection. Pinning the app root keeps build artifacts
  // (including standalone/server.js) inside the checkout that ran the build.
  turbopack: {
    root: process.cwd(),
  },
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

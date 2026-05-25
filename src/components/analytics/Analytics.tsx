// Cloudflare Web Analytics — cookieless, no PII, no consent banner needed.
// The beacon token is a PUBLIC client-side token (safe to commit). Get it from
// Cloudflare → Analytics → Web Analytics → add site elopenmike.com → copy the
// token from the JS snippet, then paste it below. Empty = analytics disabled.
const CF_BEACON_TOKEN = "a14e2ed4e49548e5b1a7787b9da254a6";

export function Analytics() {
  if (!CF_BEACON_TOKEN) return null;
  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: CF_BEACON_TOKEN })}
    />
  );
}

// Cloudflare Web Analytics — cookieless, no PII, no consent banner needed.
// Token is a public client-side beacon ID (safe to expose in HTML). Provided
// at build time via NEXT_PUBLIC_CF_BEACON_TOKEN. Unset = analytics disabled.
const CF_BEACON_TOKEN = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN;

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

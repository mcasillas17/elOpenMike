import { lookup } from "node:dns/promises";
import { redactUrl } from "./safe-url";

// The sync fetches whatever URL a Notion image block carries. Without a policy
// that is a server-side request forgery primitive: an `external` image block
// pointing at http://169.254.169.254/... would make the GitHub Actions runner
// (or a maintainer's laptop) fetch cloud instance metadata and commit the
// response into the repo as an "image". Every URL therefore has to clear this
// module before any bytes are read, and every redirect hop has to clear it too.

// How a url is written into a message lives in one module for the whole sync;
// re-exported because every error below already reads redactUrl(...) at the end
// of a sentence about a fetch.
export { redactUrl };

export type AddressResolver = (hostname: string) => Promise<string[]>;

// Hosts Notion actually serves image bytes from:
//   - prod-files-secure.s3.<region>.amazonaws.com — signed uploads (current)
//   - s3.<region>.amazonaws.com/secure.notion-static.com — signed uploads (legacy)
//   - file.notion.so — signed file redirector, which 302s to one of the above
//   - www.notion.so/image/<encoded> — Notion's own image proxy
//   - images.unsplash.com — the Unsplash picker built into Notion
// Anything else is refused by name so an `external` block can't aim the sync at
// an arbitrary origin. Add a host here (with a note) if Notion adds one.
export const ALLOWED_IMAGE_HOSTS: readonly string[] = [
  "www.notion.so",
  "notion.so",
  "file.notion.so",
  "images.unsplash.com",
  "s3.amazonaws.com",
];

// Subdomain suffixes of the same services. Matched only on a label boundary, so
// "evil-notion.so" and "notnotion.so" do not qualify.
export const ALLOWED_IMAGE_HOST_SUFFIXES: readonly string[] = [
  ".amazonaws.com",
  ".notion-static.com",
  ".notion.so",
];

const HTTPS_PORTS = new Set(["", "443"]);
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Octets(address: string): number[] | undefined {
  const match = IPV4.exec(address);
  if (!match) return undefined;
  const octets = match.slice(1, 5).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

// Blocks every IPv4 range that is not globally routable unicast: this host,
// private networks, shared CGNAT space, loopback, link-local (which is where
// cloud metadata services live), IETF protocol/benchmark/documentation
// assignments, multicast, and the reserved 240/4 block including broadcast.
function isPublicIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (octets[2] === 0 || octets[2] === 2)) return false;
  if (a === 192 && b === 88 && octets[2] === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && octets[2] === 100) return false;
  if (a === 203 && b === 0 && octets[2] === 113) return false;
  if (a >= 224) return false;
  return true;
}

// Expands an IPv6 literal to its eight 16-bit groups, folding any trailing
// dotted-quad (the ::ffff:1.2.3.4 form) into the last two groups.
function ipv6Hextets(address: string): number[] | undefined {
  const cleaned = address.replace(/%.*$/, "");
  if (!/^[0-9a-fA-F:.]+$/.test(cleaned) || !cleaned.includes(":")) {
    return undefined;
  }

  const [head, tail, ...rest] = cleaned.split("::");
  if (rest.length > 0) return undefined;

  const toGroups = (part: string): number[] | undefined => {
    if (part === "") return [];
    const groups: number[] = [];
    const pieces = part.split(":");
    for (const [index, piece] of pieces.entries()) {
      if (piece.includes(".")) {
        // A dotted quad is only legal as the final element.
        if (index !== pieces.length - 1) return undefined;
        const octets = ipv4Octets(piece);
        if (!octets) return undefined;
        groups.push((octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return undefined;
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };

  const left = toGroups(head);
  const right = tail === undefined ? [] : toGroups(tail);
  if (!left || !right) return undefined;

  if (tail === undefined) return left.length === 8 ? left : undefined;

  const fill = 8 - left.length - right.length;
  if (fill < 1) return undefined;
  return [...left, ...Array<number>(fill).fill(0), ...right];
}

function embeddedIpv4(hextets: number[]): number[] {
  const high = hextets[hextets.length - 2];
  const low = hextets[hextets.length - 1];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

// Blocks the IPv6 equivalents plus every transition format that smuggles an
// IPv4 address inside a v6 literal (IPv4-mapped, IPv4-compatible,
// IPv4-translated, 6to4, NAT64) — each of those names 127.0.0.1 or
// 169.254.169.254 just as well as the dotted form does.
function isPublicIpv6(hextets: number[]): boolean {
  const [h0, h1] = hextets;

  if (hextets.every((group) => group === 0)) return false; // ::
  if (hextets.slice(0, 7).every((g) => g === 0) && hextets[7] === 1) return false;

  // ::ffff:0:0/96 — IPv4-mapped.
  if (hextets.slice(0, 5).every((g) => g === 0) && hextets[5] === 0xffff) {
    return isPublicIpv4(embeddedIpv4(hextets));
  }
  // ::/96 — the deprecated IPv4-compatible form, e.g. ::127.0.0.1.
  if (hextets.slice(0, 6).every((g) => g === 0)) {
    return isPublicIpv4(embeddedIpv4(hextets));
  }
  // ::ffff:0:0:0/96 — IPv4-translated.
  if (
    hextets.slice(0, 4).every((g) => g === 0) &&
    hextets[4] === 0xffff &&
    hextets[5] === 0
  ) {
    return isPublicIpv4(embeddedIpv4(hextets));
  }
  // 64:ff9b::/96 — NAT64.
  if (h0 === 0x64 && h1 === 0xff9b && hextets.slice(2, 6).every((g) => g === 0)) {
    return isPublicIpv4(embeddedIpv4(hextets));
  }
  // 2002::/16 — 6to4 carries its IPv4 address in the next two groups.
  if (h0 === 0x2002) {
    return isPublicIpv4([h1 >> 8, h1 & 0xff, hextets[2] >> 8, hextets[2] & 0xff]);
  }

  if (h0 === 0x100 && hextets.slice(1, 4).every((g) => g === 0)) return false; // discard
  if ((h0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique-local
  if ((h0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((h0 & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((h0 & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (h0 === 0x2001 && h1 === 0x0db8) return false; // documentation
  return true;
}

export function isPublicUnicastAddress(address: string): boolean {
  const octets = ipv4Octets(address);
  if (octets) return isPublicIpv4(octets);
  const hextets = ipv6Hextets(address);
  return hextets ? isPublicIpv6(hextets) : false;
}

export function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_IMAGE_HOSTS.includes(host)) return true;
  return ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

async function resolveWithDns(hostname: string): Promise<string[]> {
  const entries = await lookup(hostname, { all: true, verbatim: true });
  return entries.map((entry) => entry.address);
}

// Returns the parsed URL when it is safe to fetch, and throws a redacted,
// specific error otherwise. Callers must await this for the original URL AND
// for every redirect target before issuing the corresponding request.
export async function assertSafeImageUrl(
  url: string | URL,
  resolve: AddressResolver = resolveWithDns,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = typeof url === "string" ? new URL(url) : url;
  } catch {
    throw new Error("image url is not a valid absolute url");
  }

  const where = redactUrl(parsed);

  if (parsed.protocol !== "https:") {
    throw new Error(
      `image url must use https (got ${parsed.protocol.replace(":", "")}) ${where}`,
    );
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(`image url must not carry credentials ${redactUrl(
      `${parsed.protocol}//${parsed.host}${parsed.pathname}`,
    )}`);
  }
  if (!HTTPS_PORTS.has(parsed.port)) {
    throw new Error(`image url must use the default https port ${where}`);
  }

  // URL keeps IPv6 literals bracketed; DNS and the range checks want the bare form.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!isAllowedImageHost(hostname)) {
    throw new Error(
      `image host ${hostname} is not an allowed Notion image host — ` +
        "upload the image to Notion instead of linking it externally",
    );
  }

  const addresses = await resolve(hostname);
  if (addresses.length === 0) {
    throw new Error(`image host ${hostname} did not resolve to any address`);
  }
  for (const address of addresses) {
    if (!isPublicUnicastAddress(address)) {
      throw new Error(
        `image host ${hostname} resolves to a non-public address (${address}) ${where}`,
      );
    }
  }

  return parsed;
}

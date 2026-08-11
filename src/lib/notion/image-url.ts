import { lookup } from "node:dns/promises";

// The sync fetches whatever URL a Notion image block carries. Without a policy
// that is a server-side request forgery primitive: an `external` image block
// pointing at http://169.254.169.254/... would make the GitHub Actions runner
// (or a maintainer's laptop) fetch cloud instance metadata and commit the
// response into the repo as an "image". Every URL therefore has to clear this
// module before any bytes are read, and every redirect hop has to clear it too.

export { redactUrl } from "./safe-url";

export type AddressResolver = (hostname: string) => Promise<string[]>;

export type ImageUrlRejectionReason =
  | "invalid-url"
  | "https-required"
  | "credentials-not-allowed"
  | "default-port-required"
  | "host-not-allowed"
  | "dns-resolution-failed"
  | "dns-no-addresses"
  | "non-public-address";

const REJECTION_MESSAGES: Record<ImageUrlRejectionReason, string> = {
  "invalid-url": "not a valid absolute URL",
  "https-required": "HTTPS is required",
  "credentials-not-allowed": "credentials are not allowed",
  "default-port-required": "the default HTTPS port is required",
  "host-not-allowed": "host is not an allowed Notion image host",
  "dns-resolution-failed": "host resolution failed",
  "dns-no-addresses": "host did not resolve to any address",
  "non-public-address": "host resolves to a non-public address",
};

export class ImageUrlValidationError extends Error {
  constructor(readonly reason: ImageUrlRejectionReason) {
    super(`image URL rejected: ${REJECTION_MESSAGES[reason]}`);
    this.name = "ImageUrlValidationError";
  }
}

function reject(reason: ImageUrlRejectionReason): never {
  throw new ImageUrlValidationError(reason);
}

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
];

// Subdomain suffixes of the same services. Matched only on a label boundary, so
// "evil-notion.so" and "notnotion.so" do not qualify.
//
// `.amazonaws.com` is deliberately not among them — see below.
export const ALLOWED_IMAGE_HOST_SUFFIXES: readonly string[] = [
  ".notion-static.com",
  ".notion.so",
];

// `.amazonaws.com` is not a service. It is the whole of AWS.
//
// Allowing the suffix allowed every host anybody has ever put behind that
// domain: an API Gateway stage (`<id>.execute-api.<region>.amazonaws.com`), an
// EC2 instance's public name (`ec2-<ip>.compute-1.amazonaws.com`), a queue, a
// database endpoint, a search domain. Every one of them resolves to a public
// address, so the range check below waves them through, and each is a request
// this runner makes on behalf of whoever wrote the url — with the response
// committed into the repo as an "image".
//
// Notion serves image bytes from S3 and from nothing else under that domain, so
// what is allowed is S3's own endpoint shapes rather than its domain:
//
//   <bucket>.s3.<region>.amazonaws.com   virtual-hosted, regional (current)
//   <bucket>.s3-<region>.amazonaws.com   the legacy dash spelling of the same
//   s3.<region>.amazonaws.com            path-style, regional (legacy uploads)
//   s3-<region>.amazonaws.com            path-style, legacy dash spelling
//   <bucket>.s3.amazonaws.com            the legacy global endpoint
//   s3.amazonaws.com                     the same, path-style
//
// and nothing else: no dualstack, no transfer acceleration, no other service,
// whatever region it names. A bucket name is checked as a bucket name, so a
// label that is not one cannot smuggle a different host in front of the
// endpoint.
const AWS_DOMAIN = ".amazonaws.com";

// A region as AWS spells one: two or more letters, one or more hyphenated
// words, then a number. `us-west-2`, `eu-central-1`, `ap-southeast-4`,
// `us-gov-west-1` and `cn-north-1` all match; `notaregion` does not.
const AWS_REGION = /^[a-z]{2,}(-[a-z]+)+-\d{1,2}$/;

// S3 bucket naming: 3 to 63 characters, lowercase letters, digits, hyphens and
// dots, starting and ending with a letter or a digit, and no empty label.
const S3_BUCKET_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MIN_BUCKET_LENGTH = 3;
const MAX_BUCKET_LENGTH = 63;

function isS3Bucket(labels: readonly string[]): boolean {
  if (labels.length === 0) return true; // path-style: no bucket in the host
  const name = labels.join(".");
  if (name.length < MIN_BUCKET_LENGTH || name.length > MAX_BUCKET_LENGTH) {
    return false;
  }
  return labels.every((label) => S3_BUCKET_LABEL.test(label));
}

// True for an S3 endpoint, in any of the spellings above, and for nothing else
// under .amazonaws.com.
export function isS3ImageHost(host: string): boolean {
  if (!host.endsWith(AWS_DOMAIN)) return false;

  const head = host.slice(0, -AWS_DOMAIN.length);
  if (head === "") return false;

  const labels = head.split(".");
  const endpoint = labels[labels.length - 1];

  // `s3.<region>` — the endpoint is two labels, so the bucket is everything
  // before them.
  if (labels.length >= 2 && labels[labels.length - 2] === "s3") {
    return AWS_REGION.test(endpoint) && isS3Bucket(labels.slice(0, -2));
  }

  const bucket = labels.slice(0, -1);
  // The legacy global endpoint.
  if (endpoint === "s3") return isS3Bucket(bucket);
  // The legacy dash spelling of a regional endpoint.
  if (endpoint.startsWith("s3-")) {
    return AWS_REGION.test(endpoint.slice(3)) && isS3Bucket(bucket);
  }

  return false;
}

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
  if (ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  return isS3ImageHost(host);
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
    reject("invalid-url");
  }

  if (parsed.protocol !== "https:") {
    reject("https-required");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    reject("credentials-not-allowed");
  }
  if (!HTTPS_PORTS.has(parsed.port)) {
    reject("default-port-required");
  }

  // URL keeps IPv6 literals bracketed; DNS and the range checks want the bare form.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!isAllowedImageHost(hostname)) {
    reject("host-not-allowed");
  }

  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch {
    reject("dns-resolution-failed");
  }
  if (addresses.length === 0) {
    reject("dns-no-addresses");
  }
  for (const address of addresses) {
    if (!isPublicUnicastAddress(address)) {
      reject("non-public-address");
    }
  }

  return parsed;
}

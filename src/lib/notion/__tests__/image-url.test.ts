import { describe, it, expect } from "vitest";
import {
  ALLOWED_IMAGE_HOSTS,
  assertSafeImageUrl,
  isPublicUnicastAddress,
  redactUrl,
  type AddressResolver,
} from "@/lib/notion/image-url";

// Every test injects its own resolver, so nothing here touches DNS or the
// network — the policy is exercised as pure logic.
const resolvesTo =
  (...addresses: string[]): AddressResolver =>
  async () =>
    addresses;

const publicResolver = resolvesTo("52.219.100.1");

const signedNotionUrl =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/def/photo.png" +
  "?X-Amz-Credential=AKIAEXAMPLE&X-Amz-Signature=deadbeef";

describe("isPublicUnicastAddress", () => {
  it("accepts routable public addresses", () => {
    for (const address of [
      "52.219.100.1",
      "8.8.8.8",
      "1.1.1.1",
      "2606:4700:4700::1111",
      "2600:9000:2000::1",
    ]) {
      expect(isPublicUnicastAddress(address)).toBe(true);
    }
  });

  it("rejects loopback, private, link-local, and reserved IPv4 ranges", () => {
    for (const address of [
      "0.0.0.0",
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.7",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1", // carrier-grade NAT
      "169.254.169.254", // cloud instance metadata
      "192.0.0.1",
      "198.18.0.1",
      "224.0.0.1", // multicast
      "255.255.255.255",
    ]) {
      expect(isPublicUnicastAddress(address)).toBe(false);
    }
  });

  it("rejects loopback, unique-local, and link-local IPv6 ranges", () => {
    for (const address of [
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1", // IPv4-mapped loopback
      "::ffff:169.254.169.254",
      "::ffff:7f00:1", // same, in hex form
      "2002:7f00:1::1", // 6to4 wrapping 127.0.0.1
      "64:ff9b::a00:1", // NAT64 wrapping 10.0.0.1
    ]) {
      expect(isPublicUnicastAddress(address)).toBe(false);
    }
  });

  // Every way an IPv4 address can hide inside a v6 literal has to be unwrapped,
  // not just the common ::ffff: one: ::127.0.0.1 and ::ffff:0:127.0.0.1 name
  // the same host as ::ffff:127.0.0.1.
  it("rejects the deprecated IPv4-compatible and IPv4-translated forms", () => {
    for (const address of [
      "::127.0.0.1",
      "::169.254.169.254",
      "::10.0.0.1",
      "0:0:0:0:0:0:a9fe:a9fe", // ::169.254.169.254 written in hex
      "::ffff:0:127.0.0.1",
      "::ffff:0:a9fe:a9fe",
    ]) {
      expect(isPublicUnicastAddress(address)).toBe(false);
    }
  });

  it("rejects anything that is not an IP literal", () => {
    for (const value of ["", "not-an-ip", "1.2.3", "1.2.3.4.5", "300.1.1.1"]) {
      expect(isPublicUnicastAddress(value)).toBe(false);
    }
  });
});

describe("assertSafeImageUrl", () => {
  it("accepts a signed Notion S3 url that resolves publicly", async () => {
    const url = await assertSafeImageUrl(signedNotionUrl, publicResolver);
    expect(url.hostname).toBe("prod-files-secure.s3.us-west-2.amazonaws.com");
    expect(url.searchParams.get("X-Amz-Signature")).toBe("deadbeef");
  });

  it("accepts the other hosts Notion actually serves images from", async () => {
    for (const url of [
      "https://www.notion.so/image/https%3A%2F%2Fexample.com%2Fa.png",
      "https://file.notion.so/f/f/abc/photo.png?table=block",
      "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/img.png",
      "https://images.unsplash.com/photo-1?auto=format",
    ]) {
      await expect(assertSafeImageUrl(url, publicResolver)).resolves.toBeInstanceOf(
        URL,
      );
    }
  });

  it("rejects non-https schemes", async () => {
    for (const url of [
      "http://www.notion.so/image/a.png",
      "file:///etc/passwd",
      "ftp://www.notion.so/a.png",
      "data:image/png;base64,AAAA",
    ]) {
      await expect(assertSafeImageUrl(url, publicResolver)).rejects.toThrow(
        /https/i,
      );
    }
  });

  it("rejects embedded credentials", async () => {
    await expect(
      assertSafeImageUrl(
        "https://user:pass@www.notion.so/image/a.png",
        publicResolver,
      ),
    ).rejects.toThrow(/credential/i);
  });

  it("rejects a non-default port", async () => {
    await expect(
      assertSafeImageUrl("https://www.notion.so:8443/image/a.png", publicResolver),
    ).rejects.toThrow(/port/i);
  });

  it("rejects hosts outside the allowlist", async () => {
    await expect(
      assertSafeImageUrl("https://evil.example.com/a.png", publicResolver),
    ).rejects.toThrow(/host/i);
  });

  it("rejects a host that merely ends with an allowed name", async () => {
    await expect(
      assertSafeImageUrl("https://notnotion.so/a.png", publicResolver),
    ).rejects.toThrow(/host/i);
    await expect(
      assertSafeImageUrl("https://evil-notion.so/a.png", publicResolver),
    ).rejects.toThrow(/host/i);
  });

  it("rejects an allowlisted host that resolves to loopback", async () => {
    await expect(
      assertSafeImageUrl(signedNotionUrl, resolvesTo("127.0.0.1")),
    ).rejects.toThrow(/resolves to a non-public address/i);
  });

  it("rejects an allowlisted host that resolves to link-local metadata", async () => {
    await expect(
      assertSafeImageUrl(signedNotionUrl, resolvesTo("169.254.169.254")),
    ).rejects.toThrow(/resolves to a non-public address/i);
  });

  it("rejects when any resolved address is private, not just the first", async () => {
    await expect(
      assertSafeImageUrl(signedNotionUrl, resolvesTo("52.219.100.1", "10.0.0.5")),
    ).rejects.toThrow(/resolves to a non-public address/i);
  });

  it("rejects a host that resolves to nothing", async () => {
    await expect(
      assertSafeImageUrl(signedNotionUrl, resolvesTo()),
    ).rejects.toThrow(/did not resolve/i);
  });

  it("rejects an unparseable url", async () => {
    await expect(assertSafeImageUrl("not a url", publicResolver)).rejects.toThrow(
      /url/i,
    );
  });

  it("keeps the signature out of every rejection message", async () => {
    const cases: [string, AddressResolver][] = [
      [signedNotionUrl.replace("https://", "http://"), publicResolver],
      [signedNotionUrl, resolvesTo("127.0.0.1")],
      [signedNotionUrl, resolvesTo()],
    ];
    for (const [url, resolver] of cases) {
      await expect(assertSafeImageUrl(url, resolver)).rejects.toSatisfy(
        (error: unknown) => {
          const message = (error as Error).message;
          expect(message).not.toContain("deadbeef");
          expect(message).not.toContain("X-Amz-Signature");
          return true;
        },
      );
    }
  });
});

describe("ALLOWED_IMAGE_HOSTS", () => {
  it("is documented as the exact set of hosts Notion serves images from", () => {
    expect(ALLOWED_IMAGE_HOSTS.length).toBeGreaterThan(0);
    for (const host of ALLOWED_IMAGE_HOSTS) {
      expect(host).toMatch(/^[a-z0-9.-]+$/);
    }
  });
});

describe("redactUrl", () => {
  it("drops the query string that carries the signature", () => {
    expect(redactUrl(signedNotionUrl)).toBe(
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/def/photo.png",
    );
  });

  it("describes an unparseable url without echoing it", () => {
    expect(redactUrl("not a url")).toBe("<unparseable url>");
  });
});

// How a url is allowed to appear in a log.
//
// The sync's output is a public GitHub Actions log, and every url it handles
// came from somewhere else: Notion signs its file urls with an X-Amz-Signature
// and an X-Amz-Security-Token in the query string, and a link in a post is
// whatever an author pasted — which, for the ones the converter refuses, is by
// definition the odd one: a `javascript:` url carrying a session token, a
// preview link with an API key in its query, an internal hostname nobody meant
// to publish.
//
// Two rules, in one place so they cannot drift apart:
//
//   * redactUrl keeps the origin and the path. It is what the image downloader
//     reports, where the host and the object being fetched are the whole point
//     of the message and the signature is the part that must not be repeated;
//   * describeUrlSafely keeps the scheme. It is what the converter reports for
//     a link it will not write, where the only useful facts are which block the
//     link was in — the caller says that — and what kind of url it was. The
//     rest is neither needed nor safe.

// Notion's file URLs are pre-signed S3 links whose query string carries
// X-Amz-Signature and X-Amz-Security-Token. The sync's errors are printed to a
// public Actions log, so only the location — never the credentials — is shown.
export function redactUrl(url: string | URL): string {
  try {
    const parsed = typeof url === "string" ? new URL(url) : url;
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<unparseable url>";
  }
}

// Browsers strip ASCII whitespace and control characters out of an href before
// they read its scheme, so "java\nscript:alert(1)" runs as javascript. The
// scheme is therefore read from the url with those removed, not from the url as
// written — the same rule link-destination.ts refuses one by.
const STRIPPED_BY_BROWSERS = /[\u0000-\u0020\u007f]/g;

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;

// The schemes it is safe to repeat, because they are names rather than values.
//
// The token before the first colon is only a scheme if it is one: "user:pass@
// host/path" is a url with credentials and no scheme at all, and the regex
// above matches the *username* in it — which is exactly the shape the converter
// refuses, and so exactly the shape that reaches a log. Anything not on this
// list is therefore not repeated at all; the block the link sits in is named
// instead, which is what an author needs to find it.
//
// The list is every scheme a link in a blog post plausibly carries: the ones
// the converter allows (so a message about one is still legible) and the ones
// it refuses for being a way to run code rather than a place to go.
const NAMEABLE_SCHEMES: ReadonlySet<string> = new Set([
  "about",
  "blob",
  "data",
  "file",
  "ftp",
  "http",
  "https",
  "javascript",
  "mailto",
  "sms",
  "tel",
  "vbscript",
  "view-source",
  "ws",
  "wss",
]);

// Everything about a url that is safe to print: its scheme, and nothing else —
// no credentials, no host, no path, no query, no fragment. A url with no scheme
// is a relative link, which says nothing about anywhere.
export function describeUrlSafely(url: string): string {
  const scheme = SCHEME.exec(url.replace(STRIPPED_BY_BROWSERS, ""))?.[1];

  if (scheme === undefined) return "no scheme (a relative link)";

  const name = scheme.toLowerCase();
  return NAMEABLE_SCHEMES.has(name)
    ? `scheme "${name}:"`
    : "an unrecognized scheme";
}

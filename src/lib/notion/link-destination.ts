// A Notion link carries a URL the author pasted. Markdown does not read the
// text between `](` and `)` as a URL — it reads it as a link destination, which
// is a piece of syntax with rules of its own:
//
//   * whitespace ends the destination, so `https://x.com/a b` links to
//     "https://x.com/a" and swallows " b)" as a malformed title, taking the
//     rest of the paragraph with it;
//   * parentheses only stand if they balance, so one stray `)` closes the link
//     where the author's URL was still going;
//   * a backslash escapes whatever follows it, so a Windows-style path loses
//     characters;
//   * character references are decoded, so a URL that really contains "&amp;"
//     arrives at the browser as "&";
//   * `<` opens JSX to MDX, and `>` closes it.
//
// So the URL is rewritten into the destination that *means* it: percent-encoded
// where a character cannot appear at all, backslash-escaped where it can appear
// but would be read as syntax, and left alone everywhere else. `%` is never
// touched, which is what keeps an already-encoded URL from being encoded twice —
// there is no way to tell an author's literal `%` from the start of an escape
// without guessing, and guessing corrupts every URL that carries a `%20`.

// The schemes a blog post links documents with. Anything else — javascript:,
// data:, vbscript: — is a way to run code from the page rather than a place to
// go, and Notion will happily store one. A destination with no scheme at all is
// a relative link, which is the common case and is always allowed.
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):/;

// Browsers strip ASCII whitespace and control characters out of an href before
// they read its scheme, so "java\nscript:alert(1)" runs as javascript. The
// scheme is therefore read from the URL with those removed, not from the URL as
// written.
const STRIPPED_BY_BROWSERS = /[\u0000-\u0020\u007f]/g;

// Characters that cannot appear literally in a destination: every whitespace
// character (which would end it), every control character, and the angle
// brackets MDX reads as JSX.
const MUST_ENCODE = /[\s<>]|[\u0000-\u001f\u007f-\u009f]/u;

// The shape escape.ts guards against: an ampersand that actually starts a
// character reference, which markdown would decode away.
const ENTITY_START =
  /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{0,31});/;

// micromark tracks nesting while it reads a raw destination and gives up past
// this depth (micromark-util-symbol's linkResourceDestinationBalanceMax), so
// parentheses nested deeper than this cannot stand even when they balance.
const BALANCE_LIMIT = 32;

export function isSafeLinkScheme(url: string): boolean {
  const match = SCHEME.exec(url.replace(STRIPPED_BY_BROWSERS, ""));
  return match === null || SAFE_SCHEMES.has(match[1].toLowerCase());
}

// True when the destination's parentheses cannot be left as they are. Escaping
// is decided for the whole URL rather than per character: escaping one paren of
// a pair and not the other is what turns a balanced destination into an
// unbalanced one.
function parenthesesNeedEscaping(url: string): boolean {
  let depth = 0;
  for (const char of url) {
    if (char === "(") {
      depth += 1;
      if (depth >= BALANCE_LIMIT) return true;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) return true;
    }
  }
  return depth !== 0;
}

// The markdown destination for this URL, or undefined when the URL is not a
// link to a document at all and no destination should be written.
export function markdownDestination(url: string): string | undefined {
  if (!isSafeLinkScheme(url)) return undefined;

  const escapeParens = parenthesesNeedEscaping(url);
  let out = "";

  for (let i = 0; i < url.length; i += 1) {
    const char = url[i];

    if (char === "\\") {
      out += "\\\\";
      continue;
    }
    if (char === "(" || char === ")") {
      out += escapeParens ? `\\${char}` : char;
      continue;
    }
    if (char === "&" && ENTITY_START.test(url.slice(i))) {
      out += "&amp;";
      continue;
    }
    // Surrogates reach this one at a time and match nothing below, so an astral
    // character is copied through as the two units it is written with.
    out += MUST_ENCODE.test(char) ? encodeURIComponent(char) : char;
  }

  return out;
}

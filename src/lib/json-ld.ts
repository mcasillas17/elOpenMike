// JSON-LD is injected with dangerouslySetInnerHTML, and an HTML parser closes a
// <script> at the first "</script" it sees — JSON quoting means nothing to it.
// Post titles, excerpts, and tags come from Notion, so escaping happens here
// rather than relying on every value being harmless.
//
// `<` and `>` cover the tag itself (Next's own JSON-LD guide escapes `<`);
// `&` stops an entity from reconstituting one; U+2028 and U+2029 are literal
// line terminators to a JavaScript parser but legal inside a JSON string.
// Every replacement is a valid JSON escape, so the payload still parses back to
// exactly the same value.
const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<>&\u2028\u2029]/g,
    (char) => ESCAPES[char],
  );
}

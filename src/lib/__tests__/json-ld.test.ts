import { describe, it, expect } from "vitest";
import { serializeJsonLd } from "@/lib/json-ld";

// The payload is injected with dangerouslySetInnerHTML, and an HTML parser ends
// a <script> at the first "</script" regardless of JSON quoting. Post titles,
// excerpts, and tags come from Notion, so the serializer — not the author — has
// to guarantee the tag can't be closed early.
describe("serializeJsonLd", () => {
  const hostile = '</script><script>alert("xss")</script>';

  it("never emits a literal closing script tag", () => {
    const out = serializeJsonLd({ headline: hostile });
    expect(out.toLowerCase()).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("still decodes to the original value", () => {
    const data = { headline: hostile, keywords: ["a & b", "<em>"] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("escapes the ampersand so entity parsing can't rewrite the payload", () => {
    expect(serializeJsonLd({ a: "&amp;" })).toBe('{"a":"\\u0026amp;"}');
  });

  it("escapes the unicode line separators that break JS parsers", () => {
    const value = "before\u2028middle\u2029after";
    const out = serializeJsonLd({ value });
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
    expect(JSON.parse(out)).toEqual({ value });
  });

  it("leaves ordinary content readable", () => {
    expect(serializeJsonLd({ name: "Miguel Casillas" })).toBe(
      '{"name":"Miguel Casillas"}',
    );
  });

  it("is deterministic", () => {
    const data = { a: hostile, b: [1, 2] };
    expect(serializeJsonLd(data)).toBe(serializeJsonLd(data));
  });
});

import { describe, it, expect } from "vitest";
import { escapeXml, sanitizeXmlText } from "@/lib/xml";

// The feed is XML this repo writes by hand, and everything in it — titles,
// excerpts, tag names — is text that came out of a Notion property. A
// character XML 1.0 does not allow makes the whole document ill-formed, and a
// feed reader's answer to an ill-formed document is to drop the feed, not the
// character: one stray NUL in one title and every subscriber stops receiving
// the blog. Escaping `&` and `<` never addressed that, because the character
// cannot appear at all — not raw, and not as `&#1;` either.

const codePoints = (value: string) => [...value].map((c) => c.codePointAt(0));

describe("sanitizeXmlText", () => {
  it("keeps the three whitespace controls XML allows", () => {
    expect(sanitizeXmlText("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });

  it("removes NUL and every other C0 control", () => {
    expect(sanitizeXmlText("a\u0000b")).toBe("ab");
    for (const code of [
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0e, 0x0f,
      0x10, 0x18, 0x1f,
    ]) {
      expect(sanitizeXmlText(`a${String.fromCharCode(code)}b`)).toBe("ab");
    }
  });

  it("removes DEL and the C1 controls", () => {
    for (const code of [0x7f, 0x80, 0x85, 0x9f]) {
      expect(sanitizeXmlText(`a${String.fromCharCode(code)}b`)).toBe("ab");
    }
  });

  it("removes the noncharacters", () => {
    expect(sanitizeXmlText("a\ufffeb")).toBe("ab");
    expect(sanitizeXmlText("a\uffffb")).toBe("ab");
    expect(sanitizeXmlText("a\ufdd0\ufdefb")).toBe("ab");
    expect(sanitizeXmlText(`a${String.fromCodePoint(0x1fffe)}b`)).toBe("ab");
    expect(sanitizeXmlText(`a${String.fromCodePoint(0x10ffff)}b`)).toBe("ab");
  });

  it("removes a lone surrogate but keeps a real pair", () => {
    expect(sanitizeXmlText("a\ud800b")).toBe("ab");
    expect(sanitizeXmlText("a\udfffb")).toBe("ab");
    expect(sanitizeXmlText("a\ud800\ud800b")).toBe("ab");
    expect(sanitizeXmlText("a🙂b")).toBe("a🙂b");
    expect(codePoints(sanitizeXmlText("🙂"))).toEqual([0x1f642]);
  });

  it("leaves ordinary text alone, whatever script it is in", () => {
    for (const value of [
      "A minimal tool",
      "Grüße aus München",
      "日本語のタイトル",
      "Тест",
      "emoji 🙂 and math ∑",
      "\u00a0non-breaking space",
    ]) {
      expect(sanitizeXmlText(value)).toBe(value);
    }
  });

  it("does not touch the characters escaping is for", () => {
    expect(sanitizeXmlText(`& < > " '`)).toBe(`& < > " '`);
  });

  it("is idempotent", () => {
    const messy = "a\u0000b\ud800c\ufffed\u009fe";
    expect(sanitizeXmlText(sanitizeXmlText(messy))).toBe(sanitizeXmlText(messy));
  });
});

describe("escapeXml", () => {
  it("escapes the five predefined entities", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });

  it("escapes an ampersand once, not twice", () => {
    expect(escapeXml("A & B")).toBe("A &amp; B");
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });

  it("sanitizes before it escapes, so nothing illegal survives as an entity", () => {
    expect(escapeXml("a\u0000&b")).toBe("a&amp;b");
    expect(escapeXml("a\ud800<b")).toBe("a&lt;b");
  });

  // A parser normalizes a literal carriage return to a line feed before the
  // document is read (XML 1.0 §2.11), so the only way to keep one is to write
  // it as a reference — which is not a line ending in the source at all.
  it("keeps tab and newline literal, and a carriage return as a reference", () => {
    expect(escapeXml("a\tb\nc\rd")).toBe("a\tb\nc&#13;d");
  });

  it("keeps a CRLF pair intact through a parse", () => {
    const document = new DOMParser().parseFromString(
      `<r><t>${escapeXml("a\r\nb")}</t></r>`,
      "application/xml",
    );

    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("t")?.textContent).toBe("a\r\nb");
  });
});

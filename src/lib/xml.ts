// The feed is XML this repo writes by hand, and everything that goes into it —
// a title, an excerpt, a tag name — is free text that came out of a Notion
// property. Escaping the five predefined entities is only half of what that
// takes.
//
// XML 1.0 does not merely give some characters a special meaning; it forbids
// them outright. The Char production allows tab, newline and carriage return
// and then nothing else below U+0020, no surrogate that is not part of a pair,
// and not U+FFFE or U+FFFF. A document containing one is not badly styled, it
// is *ill-formed* — and a feed reader's answer to an ill-formed document is to
// drop the whole feed rather than the character, so a single NUL pasted into
// one title unsubscribes everybody from the blog. Escaping cannot rescue it
// either: `&#0;` is just as forbidden as the byte it stands for.
//
// So the text is repaired first and escaped second, and both live here so the
// two cannot be applied in the wrong order or to only some of the fields.
//
// Removed rather than replaced: these characters are invisible by nature and
// carry no meaning in a title, so a substitute would only put a smudge where
// nothing was ever readable. What is *kept* is everything a person could have
// meant — every script, every emoji, every accented letter, and the whitespace
// XML allows.

// XML 1.0 §2.2 also calls a further set "discouraged": DEL, the C1 range and
// the noncharacters. They are legal in a 1.0 document and forbidden unescaped
// in a 1.1 one, they render as nothing anywhere, and readers handle them
// inconsistently — so they go the same way as the illegal ones.
function isPublishableCodePoint(point: number): boolean {
  if (point === 0x09 || point === 0x0a || point === 0x0d) return true;
  if (point < 0x20) return false;
  // DEL and the C1 controls, U+0085 (NEL) among them.
  if (point >= 0x7f && point <= 0x9f) return false;
  // Surrogates only ever appear here unpaired: a real pair is decoded before
  // this is asked.
  if (point >= 0xd800 && point <= 0xdfff) return false;
  // The noncharacters: U+FDD0–U+FDEF and the last two of every plane.
  if (point >= 0xfdd0 && point <= 0xfdef) return false;
  if ((point & 0xfffe) === 0xfffe) return false;
  return true;
}

// The text with everything XML cannot carry taken out of it. Nothing is
// escaped here — see escapeXml, which is what callers want.
export function sanitizeXmlText(value: string): string {
  let out = "";

  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    // A surrogate pair is one character and has to be judged as one; half a
    // pair is not a character at all and cannot appear in a document.
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (Number.isNaN(low) || low < 0xdc00 || low > 0xdfff) continue;

      index += 1;
      const point = (unit - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
      if (isPublishableCodePoint(point)) out += value[index - 1] + value[index];
      continue;
    }

    if (isPublishableCodePoint(unit)) out += value[index];
  }

  return out;
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  // XML 1.0 §2.11: a parser normalizes every literal carriage return in the
  // document to a line feed before anything else sees it, so a CR written
  // literally is a CR the reader never receives. Written as a reference it is
  // not a line ending in the source at all, and survives the parse as the
  // character the author typed. This is the one escape that is about keeping a
  // character rather than about defusing one.
  "\r": "&#13;",
};

// Text as it may appear inside an element or an attribute: repaired, then
// escaped. Every value the feed interpolates goes through this — including the
// URLs, which are built from slugs and so are no more trustworthy than the
// titles they came from.
export function escapeXml(value: string): string {
  return sanitizeXmlText(value).replace(
    /[&<>"'\r]/g,
    (character) => ENTITIES[character],
  );
}

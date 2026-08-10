// CommonMark does not decide what `**`, `*` and `~~` mean from the characters
// between them; it decides from the characters *around* them. A delimiter run
// may only open emphasis when it "left-flanks" and only close it when it
// "right-flanks", and both tests read the character on the other side:
//
//   * a run followed by whitespace cannot open, and one preceded by whitespace
//     cannot close — which is why `**Bold **then` is four literal asterisks;
//   * a run touching punctuation only flanks when the character opposite it is
//     whitespace or punctuation too — which is why `**Wow!**bar` is literal as
//     well, though nothing in it is whitespace at all;
//   * delimiter runs are maximal, so two wrappers written back to back fuse
//     into one longer run — `**a**` beside `**b**` is a run of four asterisks
//     that opens and closes nothing.
//
// Notion records none of this. It hands over runs split at arbitrary points,
// with whatever whitespace and punctuation the author typed sitting at their
// edges, so every generated delimiter has to be checked against whatever ended
// up next to it. See rich-text.ts for what is done about it.

// Whitespace, punctuation, or neither — the three groups the flanking rules are
// written in terms of. The end of the text counts as whitespace.
export type CharacterGroup = "whitespace" | "punctuation" | "other";

const WHITESPACE = /\s/u;
// CommonMark counts every Unicode punctuation *and* symbol as punctuation.
const PUNCTUATION = /\p{P}|\p{S}/u;

// The characters a delimiter run may touch whatever sits opposite it, because
// they are themselves emphasis markers: `*` and `_` from CommonMark, `~` from
// GFM's strikethrough. A wrapper nested inside another one ends up beside
// exactly these, which is what lets `**~~a~~**` stand as it is.
const ATTENTION_MARKERS = new Set(["*", "_", "~"]);

export function classifyCharacter(char: string | undefined): CharacterGroup {
  if (char === undefined || WHITESPACE.test(char)) return "whitespace";
  return PUNCTUATION.test(char) ? "punctuation" : "other";
}

// True when a delimiter run sitting beside this character can only flank if the
// character on its far side is whitespace or punctuation.
export function needsPunctuationOpposite(char: string | undefined): boolean {
  return (
    char !== undefined &&
    classifyCharacter(char) === "punctuation" &&
    !ATTENTION_MARKERS.has(char)
  );
}

// The same character, written so Markdown reads punctuation where the reader
// still reads the character — the trick escape.ts already uses to keep a
// paragraph from opening with MDX's `import`.
export function characterReference(char: string): string {
  return `&#${char.codePointAt(0)};`;
}

export type EdgeWhitespace = { lead: string; core: string; trail: string };

// `lead + core + trail` is always the text it was given, so hoisting the edges
// out of a wrapper can neither drop a space nor reorder one. `core` is empty
// only when the text is nothing but whitespace, and then it all lands in
// `lead` — a run with no text of its own has no formatting to wrap.
export function splitEdgeWhitespace(text: string): EdgeWhitespace {
  const characters = [...text];
  let start = 0;
  while (start < characters.length && WHITESPACE.test(characters[start])) {
    start += 1;
  }
  if (start === characters.length) {
    return { lead: text, core: "", trail: "" };
  }

  let end = characters.length;
  while (end > start && WHITESPACE.test(characters[end - 1])) end -= 1;

  return {
    lead: characters.slice(0, start).join(""),
    core: characters.slice(start, end).join(""),
    trail: characters.slice(end).join(""),
  };
}

// The character a generated delimiter run opens against: whatever follows the
// run, which for a wrapper nested inside another one is the inner marker.
export function afterOpeningRun(
  wrapped: string,
  marker: string,
): string | undefined {
  const characters = [...wrapped];
  let index = 0;
  while (index < characters.length && characters[index] === marker) index += 1;
  return characters[index];
}

export function beforeClosingRun(
  wrapped: string,
  marker: string,
): string | undefined {
  const characters = [...wrapped];
  let index = characters.length - 1;
  while (index >= 0 && characters[index] === marker) index -= 1;
  return characters[index];
}

export function firstCharacter(text: string): string | undefined {
  return [...text][0];
}

export function lastCharacter(text: string): string | undefined {
  const characters = [...text];
  return characters[characters.length - 1];
}

// Rewrites the first or last whole code point of a piece as the character
// reference that renders as it, which is all a stranded delimiter beside it
// needs. Only ever reached for literal prose: everything the converter
// generates — a code span, a link, another wrapper — begins and ends with
// punctuation, and punctuation is never rewritten.
export function referenceEdge(text: string, edge: "first" | "last"): string {
  const characters = [...text];
  if (characters.length === 0) return text;

  return edge === "first"
    ? characterReference(characters[0]) + characters.slice(1).join("")
    : characters.slice(0, -1).join("") +
        characterReference(characters[characters.length - 1]);
}

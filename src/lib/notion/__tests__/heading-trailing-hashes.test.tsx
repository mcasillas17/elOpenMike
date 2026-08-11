import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import { markdownToBlocks } from "../md-to-blocks";
import { block, rt } from "./fixtures/blocks";

// CommonMark lets an ATX heading close itself: a run of `#`s at the end of the
// line, preceded by a space, is a *closing sequence* and is thrown away along
// with the space in front of it. A Notion heading reading "Title #" was written
// as `## Title #`, which the site then rendered as "Title" — the hash the
// author typed disappeared, and the heading's anchor moved with it.
//
// The hashes are literal text like every other character Notion stores, so the
// one that would close the heading is escaped. Only that one: a hash in the
// middle of a heading closes nothing, and neither does one already carried
// inside an annotation, where the delimiters that follow it are what ends the
// line.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

const markdown = (blocks: Parameters<typeof blocksToMarkdown>[0]) =>
  blocksToMarkdown(blocks, ctx).replace(/\n$/, "");

const heading = (
  type: "heading_1" | "heading_2" | "heading_3",
  ...runs: Parameters<typeof rt>[]
) => markdown([block(type, { rich_text: runs.map((args) => rt(...args)) })]);

// The blog's own pipeline: the plugins src/app/blog/[slug]/page.tsx compiles
// posts with, so what these assert is what a reader sees.
async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "append",
              properties: {
                className: "heading-anchor",
                "aria-label": "Link to this section",
              },
              content: { type: "text", value: "#" },
            },
          ],
        ],
      },
    },
  });
  return render(content as ReactElement).container;
}

// The heading as it reads on the page, with the anchor link the site appends
// taken back off — that `#` is the site's, not the author's.
async function rendered(
  source: string,
  selector = "h2",
): Promise<{ text: string; id: string }> {
  const container = await renderMdx(source);
  const element = container.querySelector(selector);
  if (!element) throw new Error(`no ${selector} in ${JSON.stringify(source)}`);
  element.querySelector(".heading-anchor")?.remove();
  return { text: element.textContent ?? "", id: element.id };
}

describe("a heading whose text ends in hashes", () => {
  it("escapes the run that would close the heading", () => {
    expect(heading("heading_1", ["Title #"])).toBe("## Title \\#");
    expect(heading("heading_2", ["Title #"])).toBe("### Title \\#");
    expect(heading("heading_3", ["Title #"])).toBe("#### Title \\#");
  });

  it("escapes a longer run, and one followed by spaces", () => {
    expect(heading("heading_1", ["Title ###"])).toBe("## Title \\###");
    expect(heading("heading_1", ["Title ###   "])).toBe("## Title \\###   ");
    expect(heading("heading_2", ["Title #\t"])).toBe("### Title \\#\t");
  });

  it("escapes a heading that is nothing but hashes", () => {
    expect(heading("heading_1", ["#"])).toBe("## \\#");
    expect(heading("heading_1", ["###"])).toBe("## \\###");
  });

  it("escapes hashes the editor split across runs", () => {
    expect(heading("heading_1", ["Title #"], ["#"], ["#"])).toBe(
      "## Title \\###",
    );
    expect(heading("heading_1", ["Title "], ["##"])).toBe("## Title \\##");
  });

  it("leaves a hash that closes nothing alone", () => {
    expect(heading("heading_1", ["Title # middle"])).toBe("## Title # middle");
    expect(heading("heading_1", ["#hashtag"])).toBe("## #hashtag");
    expect(heading("heading_1", ["Title#"])).toBe("## Title#");
    expect(heading("heading_1", ["C# and F#"])).toBe("## C# and F#");
  });

  // A `#` already sitting behind a backslash cannot close anything, so adding
  // another would be a backslash the reader can see.
  it("leaves a hash the escaper already put behind a backslash alone", () => {
    expect(heading("heading_1", ["Title \\#"])).toBe("## Title \\\\#");
  });

  // The delimiters an annotation writes come after the hashes, so the line no
  // longer ends in one and nothing needs escaping.
  it("leaves an annotated trailing hash alone", () => {
    expect(heading("heading_1", ["Title "], ["###", { bold: true }])).toBe(
      "## Title **###**",
    );
    expect(heading("heading_1", ["Title #"], ["#", { bold: true }])).toBe(
      "## Title #**#**",
    );
    expect(heading("heading_1", ["Title "], ["#", { code: true }])).toBe(
      "## Title `#`",
    );
  });

  it("still writes the children of a toggleable heading after it", () => {
    expect(
      markdown([
        block("heading_1", { rich_text: [rt("Title #")], is_toggleable: true }, [
          block("paragraph", { rich_text: [rt("Under it.")] }),
        ]),
      ]),
    ).toBe("## Title \\#\n\nUnder it.");
  });
});

describe("what the site actually renders", () => {
  const cases: Array<[string, string, string]> = [
    ["one trailing hash", "Title #", "Title #"],
    ["a run of them, then spaces", "Title ###   ", "Title ###"],
    ["hashes in the middle", "Title # middle", "Title # middle"],
    ["nothing but hashes", "###", "###"],
  ];

  for (const [name, text, expected] of cases) {
    it(`keeps ${name}`, async () => {
      const { text: shown } = await rendered(heading("heading_1", [text]));
      expect(shown).toBe(expected);
    });
  }

  it("keeps them at every heading level the sync writes", async () => {
    expect((await rendered(heading("heading_1", ["Title #"]), "h2")).text).toBe(
      "Title #",
    );
    expect((await rendered(heading("heading_2", ["Title #"]), "h3")).text).toBe(
      "Title #",
    );
    expect((await rendered(heading("heading_3", ["Title #"]), "h4")).text).toBe(
      "Title #",
    );
  });

  it("keeps an annotated trailing hash, markup and all", async () => {
    const container = await renderMdx(
      heading("heading_1", ["Title "], ["###", { bold: true }]),
    );
    const h2 = container.querySelector("h2");
    h2?.querySelector(".heading-anchor")?.remove();

    expect(h2?.textContent).toBe("Title ###");
    expect(h2?.querySelector("strong")?.textContent).toBe("###");
  });

  // rehype-slug builds the anchor from the heading's text, so text the closing
  // sequence swallowed took the id with it: "Title #" and "Title" landed on the
  // same anchor, and a link to one could open the other.
  it("gives the heading the anchor its full text earns", async () => {
    const withHash = await rendered(heading("heading_1", ["Title #"]));
    const without = await rendered(heading("heading_1", ["Title"]));

    expect(without.id).toBe("title");
    expect(withHash.id).toBe("title-");
    expect(withHash.id).not.toBe(without.id);
  });
});

// The two converters are a pair, so what the sync writes has to migrate back
// into the heading it came from — and a heading somebody hand-wrote with a
// closing sequence has to migrate as the text the site showed, not as the
// characters in the file.
describe("a heading read back out of markdown", () => {
  const headingText = (source: string) => {
    const [first] = markdownToBlocks(source);
    const payload = (first as unknown as Record<string, { rich_text: Array<{ text: { content: string } }> }>)[
      (first as { type: string }).type
    ];
    return payload.rich_text.map((run) => run.text.content).join("");
  };

  it("keeps the escaped hash the sync wrote", () => {
    expect(headingText("## Title \\#\n")).toBe("Title #");
    expect(headingText("## Title \\###\n")).toBe("Title ###");
    expect(headingText("## \\###\n")).toBe("###");
  });

  it("drops a closing sequence the author wrote, as the site does", () => {
    expect(headingText("## Title ###\n")).toBe("Title");
    expect(headingText("## Title #\n")).toBe("Title");
  });

  it("keeps a hash that closes nothing", () => {
    expect(headingText("## Title # middle\n")).toBe("Title # middle");
    expect(headingText("## Title#\n")).toBe("Title#");
  });

  it("round-trips every heading the sync can write", () => {
    for (const text of ["Title #", "Title ###   ", "###", "Title # middle"]) {
      const source = `${heading("heading_1", [text])}\n`;
      expect(headingText(source)).toBe(text.trimEnd());
    }
  });
});

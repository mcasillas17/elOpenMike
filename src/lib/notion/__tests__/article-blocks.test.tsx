import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import type { BlockObjectRequest } from "@notionhq/client";
import { blocksToMarkdown } from "../blocks-to-md";
import { markdownToBlocks } from "../md-to-blocks";
import type { RichTextInput } from "../md-to-rich-text";
import type { MdBlock } from "../types";
import { block, rt } from "./fixtures/blocks";
import { articleComponents } from "./fixtures/article-components";

const context = { imagePath: () => "/images/notion/diagram.png" };
const write = (blocks: MdBlock[]) => blocksToMarkdown(blocks, context);
const plain = (runs: RichTextInput) =>
  runs.map((run) => "text" in run ? run.text.content : "").join("");

function synced(request: BlockObjectRequest): MdBlock {
  const record = request as unknown as Record<string, Record<string, unknown>>;
  const type = request.type!;
  const data = { ...record[type] };
  for (const key of ["rich_text", "caption"]) {
    if (Array.isArray(data[key])) {
      data[key] = (data[key] as RichTextInput).map((run) => {
        if (!("text" in run)) throw new Error("expected text");
        return rt(run.text.content, { ...run.annotations, href: run.text.link?.url });
      });
    }
  }
  const children = (data.children as BlockObjectRequest[] | undefined) ?? [];
  delete data.children;
  return block(type, data, children.map(synced));
}

async function compile(source: string) {
  const { content } = await compileMDX({ source, components: articleComponents });
  return render(content).container;
}

describe("native article semantics", () => {
  it.each(["red", "orange", "yellow", "red_background", "orange_background", "yellow_background"])(
    "preserves warning callout color %s and nested blocks", (color) => {
      const markdown = write([block("callout", {
        rich_text: [rt("Read ", { bold: true }), rt("this")],
        icon: { type: "emoji", emoji: "⚠️" }, color,
      }, [block("bulleted_list_item", { rich_text: [rt("Carefully")] })])]);
      expect(markdown).toBe(`<ArticleCallout tone="warning" icon="⚠️" color="${color}">\n\n**Read** this\n\n- Carefully\n\n</ArticleCallout>\n`);
      const migrated = markdownToBlocks(markdown);
      expect(migrated[0]).toMatchObject({ type: "callout", callout: {
        color, icon: { type: "emoji", emoji: "⚠️" },
        children: [{ type: "bulleted_list_item" }],
      } });
      expect(write(migrated.map(synced))).toBe(markdown);
    },
  );

  it("escapes every static attribute delimiter without evaluating author text", async () => {
    const emoji = `" < > & &#123; {boom}\n'`;
    const markdown = write([block("callout", {
      rich_text: [rt("import nope\n\nexport const nope = 1\n<{bad}>")],
      icon: { type: "emoji", emoji }, color: "blue_background",
    })]);
    expect(markdown).toContain('tone="note"');
    expect(markdown).toContain('icon="&quot; &lt; &gt; &amp; &amp;#123; &#123;boom&#125;&#10;&#39;"');
    const container = await compile(markdown);
    expect(container.querySelector("aside")?.getAttribute("data-icon")).toBe(emoji);
    expect(container.textContent).toContain("export const nope = 1");
    expect(container.textContent).toContain("<{bad}>");
    expect(markdownToBlocks(markdown)[0]).toMatchObject({
      callout: { icon: { type: "emoji", emoji } },
    });
  });

  it("does not turn file icons into attributes or downloads", () => {
    const markdown = write([block("callout", {
      rich_text: [], icon: { type: "external", external: { url: "https://private/token" } },
    })]);
    expect(markdown).toBe('<ArticleCallout tone="note">\n\n</ArticleCallout>\n');
    expect(markdownToBlocks(markdown)[0]).toMatchObject({ type: "callout", callout: { rich_text: [] } });
  });

  it("keeps a rich multiline summary inline and its children inside the toggle", async () => {
    const markdown = write([block("toggle", {
      rich_text: [rt("More\n\n<{details}>", { bold: true })],
    }, [block("paragraph", { rich_text: [rt("Inside")] })])]);
    expect(markdown).toContain("<ArticleToggle>\n\n<ArticleSummary>");
    const container = await compile(markdown);
    expect(container.querySelector("details > summary strong")?.textContent).toBe("More\n\n<{details}>");
    expect(container.querySelector("summary p")).toBeNull();
    expect(container.querySelector("details p")?.textContent).toBe("Inside");
    expect(write(markdownToBlocks(markdown).map(synced))).toBe(markdown);
  });

  it("preserves empty summaries and toggles", async () => {
    const markdown = write([block("toggle", { rich_text: [] })]);
    expect(markdown).toBe("<ArticleToggle>\n\n<ArticleSummary></ArticleSummary>\n\n</ArticleToggle>\n");
    expect((await compile(markdown)).querySelector("summary")?.textContent).toBe("Details");
    expect(markdownToBlocks(markdown)[0]).toMatchObject({ type: "toggle", toggle: { rich_text: [] } });
  });

  it("preserves code captions, raw closing-tag lines, and explicit Before/After adjacency", async () => {
    const code = '</ArticleCode>\n<ArticleToggle>\n```\n<T>{literal}';
    const markdown = write(["Before", "After"].map((caption) => block("code", {
      rich_text: [rt(code)], language: "typescript", caption: [rt(caption)],
    })));
    expect(markdown).toContain("</ArticleCode>\n\n<ArticleCode>");
    const container = await compile(markdown);
    expect(container.querySelectorAll("section[data-code]")).toHaveLength(2);
    expect(container.querySelector("code")?.textContent).toContain(code);
    const migrated = markdownToBlocks(markdown);
    expect(migrated[0]).toMatchObject({ type: "code", code: { caption: [{ text: { content: "Before" } }] } });
    expect(write(migrated.map(synced))).toBe(markdown);
  });

  it("preserves rich image captions, line breaks and local-only image sources", async () => {
    const markdown = write([block("image", { caption: [
      rt("Diagram ", { bold: true }), rt("line\n\n<{next}>", { underline: true }),
    ] })]);
    expect(markdown).toContain("<ArticleFigure>\n\n![");
    const container = await compile(markdown);
    expect(container.querySelector("figure img")?.getAttribute("src")).toBe(context.imagePath());
    expect(container.querySelector("figcaption strong")?.textContent).toBe("Diagram");
    expect(container.querySelector("figcaption u")?.textContent).toBe("line\n\n<{next}>");
    expect(() => markdownToBlocks(markdown)).toThrow(/image.*resolver.*line 3/);
    const migrated = markdownToBlocks(markdown, {
      imageUrl: (path) => path === context.imagePath() ? "https://example.com/diagram.png" : undefined,
    });
    expect(migrated[0]).toMatchObject({ type: "image", image: {
      type: "external", external: { url: "https://example.com/diagram.png" },
    } });
    expect(write(migrated.map(synced))).toBe(markdown);
  });

  it("migrates a safe reference to a bookmark, keeping label annotations", async () => {
    const markdown = write([block("link_preview", {
      url: "https://example.com/a(b)?one=1&two=2", caption: [rt("Docs\nhere", { bold: true })],
    })]);
    expect(markdown).toMatch(/^<ArticleReference>\n\n\[/);
    expect((await compile(markdown)).querySelector("nav a strong")?.textContent).toBe("Docs\nhere");
    const migrated = markdownToBlocks(markdown);
    expect(migrated[0]).toMatchObject({ type: "bookmark", bookmark: {
      url: "https://example.com/a(b)?one=1&two=2",
      caption: [{ annotations: { bold: true }, text: { content: "Docs\nhere" } }],
    } });
    expect(write(migrated.map(synced))).toBe(markdown);
  });

  it("does not wrap unsafe references or leak their destination in warnings", () => {
    const warnings: string[] = [];
    const markdown = blocksToMarkdown([block("bookmark", {
      url: "javascript:private-secret", caption: [rt("Read literally")],
    })], { ...context, onWarning: (warning) => warnings.push(warning) });
    expect(markdown).toBe("Read literally\n");
    expect(warnings.join()).not.toContain("private-secret");
  });

  it("reports an unsafe image-caption link only once despite its alt and visible copies", () => {
    const warnings: string[] = [];
    const markdown = blocksToMarkdown([block("image", {
      caption: [rt("Caption", { href: "javascript:private-secret" })],
    })], { ...context, onWarning: (warning) => warnings.push(warning) });
    expect(markdown).toContain("<ArticleCaption>Caption</ArticleCaption>");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain("private-secret");
  });

  it("keeps rich caption links, literal closing tags, and whitespace intact", async () => {
    const caption = [
      rt(" leading "),
      rt("</ArticleCaption>", { code: true }),
      rt("\n\n"),
      rt("link", { underline: true, href: "https://example.com/docs" }),
      rt(" trailing "),
    ];
    const markdown = write([block("code", {
      rich_text: [rt("raw")], caption, language: "plain text",
    })]);
    const container = await compile(markdown);
    expect(container.querySelector("figcaption")?.textContent).toBe(" leading </ArticleCaption>\n\nlink trailing ");
    expect(container.querySelector("figcaption a")?.getAttribute("href")).toBe("https://example.com/docs");
    expect(write(markdownToBlocks(markdown).map(synced))).toBe(markdown);
  });

  it.each(["A [literal]", "code ]( looks like a destination", "\\ backslash"])(
    "migrates a reference whose formatted label contains %s", (label) => {
      const markdown = write([block("bookmark", {
        url: "https://example.com/a)b?q=&amp;x", caption: [rt(label, { code: true })],
      })]);
      expect(write(markdownToBlocks(markdown).map(synced))).toBe(markdown);
    },
  );

  it.each(["bulleted_list_item", "numbered_list_item", "quote"])(
    "compiles wrappers nested in %s and migrates the permitted depth", async (type) => {
      const markdown = write([block(type, { rich_text: [rt("Parent")] }, [
        block("toggle", { rich_text: [rt("More")] }),
        block("callout", { rich_text: [rt("Note")] }),
        block("code", { rich_text: [rt("</ArticleCode>")], caption: [rt("Snippet")] }),
      ])]);
      const container = await compile(markdown);
      const parent = container.querySelector(type === "quote" ? "blockquote" : "li");
      expect(parent?.querySelector("details summary")?.textContent).toBe("More");
      expect(parent?.querySelector("aside")?.textContent).toContain("Note");
      expect(parent?.querySelector("pre code")?.textContent).toContain("</ArticleCode>");
      expect(write(markdownToBlocks(markdown).map(synced))).toBe(markdown);
    },
  );
});

describe("strict article migration grammar", () => {
  const invalid = [
    '<Unknown token="private-secret">hello</Unknown>',
    '<ArticleCallout tone={privateSecret}>\n\ntext\n\n</ArticleCallout>',
    '<ArticleCallout tone="note" onClick="private-secret">\n\ntext\n\n</ArticleCallout>',
    '<ArticleCallout tone="note" tone="warning">\n\ntext\n\n</ArticleCallout>',
    '<ArticleCallout tone="note" color="private-secret">\n\ntext\n\n</ArticleCallout>',
    '<ArticleToggle {...privateSecret}>\n\n</ArticleToggle>',
    '<ArticleSummary>private-secret</ArticleSummary>',
    '<ArticleCaption>private-secret</ArticleCaption>',
    '<ArticleToggle>\n\nprivate-secret\n\n</ArticleToggle>',
    '<ArticleToggle>\n\n<ArticleSummary>x</ArticleSummary>\n\n</ArticleCode>',
    '<ArticleCode>\n\n<ArticleCaption>x</ArticleCaption>\n\nprivate-secret\n\n</ArticleCode>',
    '<ArticleReference>\n\n[private-secret](javascript:private-secret)\n\n</ArticleReference>',
    '<ArticleReference>\n\n[a](https://a.test) [b](https://b.test)\n\n</ArticleReference>',
    '<ArticleFigure>\n\n![private-secret](https://private-secret.test/a.png)\n\n<ArticleCaption>x</ArticleCaption>\n\n</ArticleFigure>',
    '<ArticleFigure>\n\n![private-secret](/images/private-secret.svg)\n\n<ArticleCaption>x</ArticleCaption>\n\n</ArticleFigure>',
    '<ArticleFigure>\n\n![private-secret](/images/../private-secret.png)\n\n<ArticleCaption>x</ArticleCaption>\n\n</ArticleFigure>',
    '<ArticleCode>\n\n<ArticleCaption>private-secret</ArticleCaption>\n\n    ```js\nraw\n    ```\n\n</ArticleCode>',
    '<ArticleToggle>\n\n    <ArticleSummary>private-secret</ArticleSummary>\n\n</ArticleToggle>',
    '<ArticleCallout tone="note">\n\nprivate-secret\n\n    </ArticleCallout>',
  ];
  it.each(invalid)("refuses unsupported source without echoing its content: %#", (source) => {
    let failure: unknown;
    try { markdownToBlocks(source); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toMatch(/line \d+/);
    expect(String(failure)).not.toMatch(/private-secret|privateSecret/);
  });

  it("still refuses children three Notion levels deep, including article wrappers", () => {
    const source = write([block("quote", { rich_text: [rt("outer")] }, [
      block("toggle", { rich_text: [rt("middle")] }, [
        block("paragraph", { rich_text: [rt("deep")] }),
      ]),
    ])]);
    expect(() => markdownToBlocks(source)).toThrow(/three levels deep.*line 3/);
  });

  it("keeps old Markdown links, quotes and unlabeled fences unchanged", () => {
    const source = "[Docs](https://example.com)\n\n> Note\n\n```text\nraw\n```\n";
    expect(write(markdownToBlocks(source).map(synced))).toBe(source);
    expect(plain((markdownToBlocks("plain")[0] as Extract<BlockObjectRequest, { paragraph: unknown }>).paragraph.rich_text)).toBe("plain");
  });

  it.each([
    undefined, "javascript:private-secret", "https://example.com/private-secret.svg",
    "https://user:private-secret@example.com/image.png", "http://example.com/private-secret.png",
  ])("rejects unsuitable resolver results without echoing the URL: %#", (url) => {
    const source = write([block("image", { caption: [rt("Caption")] })]);
    expect(() => markdownToBlocks(source, { imageUrl: () => url })).toThrow(/image.*line 3/);
    try { markdownToBlocks(source, { imageUrl: () => url }); } catch (error) {
      expect(String(error)).not.toContain("private-secret");
    }
  });

  it("allows an explicitly resolved uncaptioned image, but still refuses remote Markdown images", () => {
    const source = write([block("image", { caption: [] })]);
    const imageUrl = () => "https://example.com/image.webp";
    expect(write(markdownToBlocks(source, { imageUrl }).map(synced))).toBe(source);
    expect(() => markdownToBlocks("![x](https://example.com/image.png)", { imageUrl })).toThrow(/image/);
  });

  it.each(["bulleted_list_item", "numbered_list_item", "quote"])(
    "migrates a resolved uncaptioned image inside %s", (type) => {
      const source = write([block(type, { rich_text: [rt("Parent")] }, [
        block("image", { caption: [] }),
      ])]);
      const migrated = markdownToBlocks(source, { imageUrl: () => "https://example.com/image.png" });
      expect(write(migrated.map(synced))).toBe(source);
    },
  );

  it("bounds pathological wrapper recursion with a redacted refusal rather than a stack overflow", () => {
    const source = '<ArticleCallout tone="note">\n\n'.repeat(1000) +
      "private-secret\n\n" + "</ArticleCallout>\n\n".repeat(1000);
    expect(() => markdownToBlocks(source)).toThrow(/three levels deep.*line \d+/);
  });
});

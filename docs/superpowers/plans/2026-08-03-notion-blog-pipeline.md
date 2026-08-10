# elOpenMike — Plan A: Notion Blog Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish blog posts written in Notion (phone or desktop) to elopenmike.com with no terminal and no git in the authoring loop.

**Architecture:** A scheduled GitHub Action runs `scripts/sync-notion.ts`, which queries a Notion database for `Status = Published` pages, converts their block trees to Markdown, downloads their images under content-addressed names, validates everything, and reconciles the result against `content/blog/`. Any change is committed and pushed, which triggers the existing deploy workflow. The site's rendering half is unchanged — it still reads `.mdx` off the filesystem — so Notion is a build-time input, never a runtime dependency.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, `@notionhq/client` v5, Vitest. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-08-03-notion-blog-pipeline-design.md` (§3–§8, §9.6, §10, §11, §16)

## Global Constraints

- Run all commands from the repo root with absolute paths; cwd does not persist between Bash calls.
- Single test: `pnpm exec vitest run <path>`. All tests: `pnpm test`. Build: `pnpm run build`. Lint: `pnpm lint`.
- **Vitest only collects `src/**/*.test.{ts,tsx}`** (`vitest.config.mts`). All testable logic must live under `src/`. `scripts/` holds thin orchestration only.
- New deps install under the 7-day `minimumReleaseAge` cooldown in `pnpm-workspace.yaml`; `pnpm add` auto-selects a version older than 7 days. If `pnpm install` errors with `ERR_PNPM_IGNORED_BUILDS`, evaluate the package and add to `allowBuilds` ONLY if it genuinely needs its build script (`@notionhq/client` does not).
- Notion API version is **`2026-03-11`** exactly. In this version `archived` is named `in_trash`.
- Reuse the design system: `Container`, `Tag`, tokens `bg-surface`/`border-edge`/`text-spidey`/`text-web`/`text-muted`/`text-ink`, `font-display`/`font-body`. NEVER use `font-[family-name:...]`.
- Generated MDX uses `\n` line endings, exactly one trailing newline, and frontmatter keys in the order `title`, `date`, `excerpt`, `tags`, `updated`.
- Commits: Conventional Commits ending with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

```
src/lib/notion/
  types.ts                    # CREATE: shared types (blocks, rich text, PostSource, PostMeta)
  slug.ts                     # CREATE: slugify + validation (PURE)
  rich-text.ts                # CREATE: rich_text[] → markdown inline, MDX escaping (PURE)
  blocks-to-md.ts             # CREATE: block tree → markdown body (PURE)
  serialize.ts                # CREATE: meta + body → .mdx contents; content projection (PURE)
  validate.ts                 # CREATE: PostSource[] → error list (PURE)
  reconcile.ts                # CREATE: desired vs on-disk file set → write/delete plan (PURE)
  images.ts                   # CREATE: hashing + extension (PURE) and download (I/O)
  client.ts                   # CREATE: SDK wrapper — data source resolution, pagination, retry
  fetch-post.ts               # CREATE: page + recursive block tree → PostSource (I/O)
  __tests__/
    slug.test.ts              # CREATE
    rich-text.test.ts         # CREATE
    blocks-to-md.test.ts      # CREATE
    serialize.test.ts         # CREATE
    validate.test.ts          # CREATE
    reconcile.test.ts         # CREATE
    images.test.ts            # CREATE
    idempotency.test.ts       # CREATE
    fixtures/
      blocks.ts               # CREATE: hand-written Notion block fixtures
scripts/
  sync-notion.ts              # CREATE: orchestration entry point
  mdx-to-notion.ts            # CREATE: one-time migration of existing posts
src/components/blog/
  mdx-components.tsx          # MODIFY: add h4 style (spec §9.6)
.github/workflows/
  sync-content.yml            # CREATE: cron + workflow_dispatch
docs/authoring.md             # CREATE: user-facing authoring guide
README.md                     # MODIFY: content section + secrets
package.json                  # MODIFY: sync:notion script, tsx devDependency
```

---

### Task 1: Types and slug utilities

**Files:**
- Create: `src/lib/notion/types.ts`
- Create: `src/lib/notion/slug.ts`
- Test: `src/lib/notion/__tests__/slug.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `slugify(input: string): string`, `SLUG_PATTERN: RegExp`, `isValidSlug(s: string): boolean`. Types `RichText`, `NotionBlock`, `MdBlock`, `PostSource`, `PostFrontmatter`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notion/__tests__/slug.test.ts
import { describe, it, expect } from "vitest";
import { slugify, isValidSlug } from "@/lib/notion/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Grounding Agents In Real Data")).toBe(
      "grounding-agents-in-real-data",
    );
  });

  it("strips diacritics", () => {
    expect(slugify("Café Días")).toBe("cafe-dias");
  });

  it("collapses punctuation and repeated separators", () => {
    expect(slugify("What's  new -- in Next.js 16?!")).toBe(
      "what-s-new-in-next-js-16",
    );
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  ...hello...  ")).toBe("hello");
  });

  it("returns empty string when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase hyphenated slugs", () => {
    expect(isValidSlug("a-valid-slug-2")).toBe(true);
  });

  it.each(["", "Has-Caps", "trailing-", "-leading", "double--hyphen", "has space"])(
    "rejects %j",
    (bad) => {
      expect(isValidSlug(bad)).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/notion/__tests__/slug.test.ts`
Expected: FAIL — cannot resolve `@/lib/notion/slug`.

- [ ] **Step 3: Write the types**

```ts
// src/lib/notion/types.ts

export type Annotations = {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
};

export type RichText = {
  plain_text: string;
  href: string | null;
  annotations: Annotations;
};

// Minimal structural shape of a Notion block. The SDK's own union is huge and
// changes between API versions; we only read the fields we convert.
export type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
};

// A block with its children resolved. `fetch-post.ts` builds this tree.
export type MdBlock = NotionBlock & { children: MdBlock[] };

export type PostFrontmatter = {
  title: string;
  date: string; // YYYY-MM-DD
  excerpt: string;
  tags: string[];
  updated: string; // YYYY-MM-DD
};

// One published Notion page, fully fetched and ready to convert.
export type PostSource = {
  pageId: string;
  slug: string;
  frontmatter: PostFrontmatter;
  blocks: MdBlock[];
};
```

- [ ] **Step 4: Write the slug implementation**

```ts
// src/lib/notion/slug.ts

// Slugs are the URL path segment for a post, so they must be stable, lowercase,
// and free of anything that needs escaping.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/notion/__tests__/slug.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notion/types.ts src/lib/notion/slug.ts src/lib/notion/__tests__/slug.test.ts
git commit -m "feat(notion): add block types and slug utilities

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rich text → Markdown with MDX escaping

**Files:**
- Create: `src/lib/notion/rich-text.ts`
- Test: `src/lib/notion/__tests__/rich-text.test.ts`

**Interfaces:**
- Consumes: `RichText` from Task 1.
- Produces: `escapeMdx(text: string): string`, `richTextToMarkdown(rich: RichText[]): string`, and the test helper `rt(text, opts?)` exported from the fixtures module created here.

**Why this matters:** post bodies are compiled as **MDX**, where `{` starts a JS expression and `<` starts JSX. Unescaped, a post containing `Array<{id: string}>` in prose fails the build. Text inside `code` annotations is not parsed by MDX and must NOT be escaped.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notion/__tests__/rich-text.test.ts
import { describe, it, expect } from "vitest";
import { escapeMdx, richTextToMarkdown } from "@/lib/notion/rich-text";
import { rt } from "./fixtures/blocks";

describe("escapeMdx", () => {
  it("escapes MDX-significant characters", () => {
    expect(escapeMdx("Array<{id: string}>")).toBe(
      "Array&lt;&#123;id: string&#125;>",
    );
  });

  it("leaves ordinary prose untouched", () => {
    expect(escapeMdx("plain prose, 100% fine")).toBe("plain prose, 100% fine");
  });
});

describe("richTextToMarkdown", () => {
  it("renders plain text", () => {
    expect(richTextToMarkdown([rt("hello")])).toBe("hello");
  });

  it("applies bold, italic, and strikethrough", () => {
    expect(richTextToMarkdown([rt("a", { bold: true })])).toBe("**a**");
    expect(richTextToMarkdown([rt("a", { italic: true })])).toBe("_a_");
    expect(richTextToMarkdown([rt("a", { strikethrough: true })])).toBe("~~a~~");
  });

  it("composes annotations innermost-out: code, strike, italic, bold, link", () => {
    const node = rt("useState", {
      code: true,
      bold: true,
      href: "https://react.dev",
    });
    expect(richTextToMarkdown([node])).toBe("[**`useState`**](https://react.dev)");
  });

  it("does NOT escape MDX characters inside code annotations", () => {
    expect(richTextToMarkdown([rt("Array<{id}>", { code: true })])).toBe(
      "`Array<{id}>`",
    );
  });

  it("DOES escape MDX characters in plain runs", () => {
    expect(richTextToMarkdown([rt("Array<{id}>")])).toBe(
      "Array&lt;&#123;id&#125;>",
    );
  });

  it("leaves whitespace-only runs unwrapped", () => {
    // Notion splits styled text into runs; a bold space would emit `** **`,
    // which markdown renders literally instead of as emphasis.
    const parts = [rt("bold", { bold: true }), rt(" ", { bold: true }), rt("tail")];
    expect(richTextToMarkdown(parts)).toBe("**bold** tail");
  });

  it("concatenates multiple runs", () => {
    expect(
      richTextToMarkdown([rt("a "), rt("b", { bold: true }), rt(" c")]),
    ).toBe("a **b** c");
  });

  it("returns empty string for no runs", () => {
    expect(richTextToMarkdown([])).toBe("");
  });
});
```

- [ ] **Step 2: Create the fixture helper**

```ts
// src/lib/notion/__tests__/fixtures/blocks.ts
import type { RichText, MdBlock } from "@/lib/notion/types";

// Builds a Notion rich_text node with the annotation defaults the API returns.
export function rt(
  text: string,
  opts: Partial<RichText["annotations"]> & { href?: string } = {},
): RichText {
  const { href, ...annotations } = opts;
  return {
    plain_text: text,
    href: href ?? null,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      ...annotations,
    },
  };
}

// Builds a block with children already resolved, as fetch-post.ts produces.
export function block(
  type: string,
  payload: Record<string, unknown>,
  children: MdBlock[] = [],
): MdBlock {
  return {
    id: `${type}-${JSON.stringify(payload).length}-${children.length}`,
    type,
    has_children: children.length > 0,
    [type]: payload,
    children,
  };
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/notion/__tests__/rich-text.test.ts`
Expected: FAIL — cannot resolve `@/lib/notion/rich-text`.

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/notion/rich-text.ts
import type { RichText } from "./types";

// Post bodies compile as MDX, where `{` opens a JS expression and `<` opens
// JSX. Escape those in prose so a post can talk about `Array<{id: string}>`
// without breaking the build. `>` is safe outside JSX and is left alone so
// blockquote markers and prose arrows read naturally.
const MDX_ESCAPES: Record<string, string> = {
  "{": "&#123;",
  "}": "&#125;",
  "<": "&lt;",
};

export function escapeMdx(text: string): string {
  return text.replace(/[{}<]/g, (char) => MDX_ESCAPES[char]);
}

export function richTextToMarkdown(rich: RichText[]): string {
  return rich.map(renderRun).join("");
}

function renderRun(node: RichText): string {
  const { annotations, href, plain_text: text } = node;

  // Notion splits styled text into runs; wrapping a whitespace-only run yields
  // `** **`, which markdown renders as literal asterisks.
  if (text.trim() === "") return text;

  // MDX does not parse the inside of inline code, so it must not be escaped.
  let out = annotations.code ? `\`${text}\`` : escapeMdx(text);

  if (annotations.strikethrough) out = `~~${out}~~`;
  if (annotations.italic) out = `_${out}_`;
  if (annotations.bold) out = `**${out}**`;
  if (href) out = `[${out}](${href})`;

  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/notion/__tests__/rich-text.test.ts`
Expected: PASS — all 9 cases green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notion/rich-text.ts src/lib/notion/__tests__/rich-text.test.ts src/lib/notion/__tests__/fixtures/blocks.ts
git commit -m "feat(notion): convert rich text to markdown with MDX escaping

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Block tree → Markdown body

**Files:**
- Create: `src/lib/notion/blocks-to-md.ts`
- Modify: `src/lib/notion/__tests__/fixtures/blocks.ts` (add `sampleBlocks`)
- Test: `src/lib/notion/__tests__/blocks-to-md.test.ts`

**Interfaces:**
- Consumes: `richTextToMarkdown` (Task 2), `MdBlock` (Task 1).
- Produces: `blocksToMarkdown(blocks: MdBlock[], ctx: ConvertContext): string` and `type ConvertContext = { imagePath: (blockId: string) => string }`.

**Design note:** image *paths* are injected via `ConvertContext` rather than resolved here. That keeps this module pure and lets the tests assert conversion without touching the network or filesystem.

**Heading scale (spec §5.1):** Notion H1/H2/H3 → `##`/`###`/`####`. The post title already occupies the page `<h1>`; mapping H1 and H2 both to `##` would render two levels the author deliberately distinguished as identical.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notion/__tests__/blocks-to-md.test.ts
import { describe, it, expect } from "vitest";
import { blocksToMarkdown, type ConvertContext } from "@/lib/notion/blocks-to-md";
import { rt, block } from "./fixtures/blocks";

const ctx: ConvertContext = { imagePath: (id) => `/images/blog/post/${id}.webp` };
const convert = (blocks: Parameters<typeof blocksToMarkdown>[0]) =>
  blocksToMarkdown(blocks, ctx);

describe("blocksToMarkdown — headings", () => {
  it("shifts the heading scale down one level", () => {
    const out = convert([
      block("heading_1", { rich_text: [rt("One")] }),
      block("heading_2", { rich_text: [rt("Two")] }),
      block("heading_3", { rich_text: [rt("Three")] }),
    ]);
    expect(out).toBe("## One\n\n### Two\n\n#### Three\n");
  });
});

describe("blocksToMarkdown — text blocks", () => {
  it("renders paragraphs separated by blank lines", () => {
    const out = convert([
      block("paragraph", { rich_text: [rt("First.")] }),
      block("paragraph", { rich_text: [rt("Second.")] }),
    ]);
    expect(out).toBe("First.\n\nSecond.\n");
  });

  it("skips empty paragraphs", () => {
    const out = convert([
      block("paragraph", { rich_text: [rt("Only.")] }),
      block("paragraph", { rich_text: [] }),
    ]);
    expect(out).toBe("Only.\n");
  });

  it("renders quotes and dividers", () => {
    const out = convert([
      block("quote", { rich_text: [rt("Quoted.")] }),
      block("divider", {}),
    ]);
    expect(out).toBe("> Quoted.\n\n---\n");
  });

  it("renders a callout as a quote with its emoji", () => {
    const out = convert([
      block("callout", {
        rich_text: [rt("Heads up.")],
        icon: { type: "emoji", emoji: "💡" },
      }),
    ]);
    expect(out).toBe("> 💡 Heads up.\n");
  });
});

describe("blocksToMarkdown — lists", () => {
  it("renders bulleted lists", () => {
    const out = convert([
      block("bulleted_list_item", { rich_text: [rt("a")] }),
      block("bulleted_list_item", { rich_text: [rt("b")] }),
    ]);
    expect(out).toBe("- a\n- b\n");
  });

  it("numbers ordered lists sequentially and resets after a break", () => {
    const out = convert([
      block("numbered_list_item", { rich_text: [rt("one")] }),
      block("numbered_list_item", { rich_text: [rt("two")] }),
      block("paragraph", { rich_text: [rt("break")] }),
      block("numbered_list_item", { rich_text: [rt("restart")] }),
    ]);
    expect(out).toBe("1. one\n2. two\n\nbreak\n\n1. restart\n");
  });

  it("indents nested lists two spaces per level", () => {
    const out = convert([
      block("bulleted_list_item", { rich_text: [rt("top")] }, [
        block("bulleted_list_item", { rich_text: [rt("mid")] }, [
          block("bulleted_list_item", { rich_text: [rt("deep")] }),
        ]),
      ]),
    ]);
    expect(out).toBe("- top\n  - mid\n    - deep\n");
  });

  it("renders to_do items as GFM task list items", () => {
    const out = convert([
      block("to_do", { rich_text: [rt("done")], checked: true }),
      block("to_do", { rich_text: [rt("open")], checked: false }),
    ]);
    expect(out).toBe("- [x] done\n- [ ] open\n");
  });
});

describe("blocksToMarkdown — code", () => {
  it("fences code with its mapped language and does not escape contents", () => {
    const out = convert([
      block("code", {
        rich_text: [rt("const a = <T>{};")],
        language: "typescript",
      }),
    ]);
    expect(out).toBe("```ts\nconst a = <T>{};\n```\n");
  });

  it("falls back to text for unknown languages", () => {
    const out = convert([
      block("code", { rich_text: [rt("hi")], language: "brainfuck" }),
    ]);
    expect(out).toBe("```text\nhi\n```\n");
  });
});

describe("blocksToMarkdown — images and tables", () => {
  it("resolves image paths through the context and uses the caption as alt", () => {
    const img = block("image", {
      type: "file",
      file: { url: "https://s3/signed" },
      caption: [rt("A diagram")],
    });
    const out = convert([img]);
    expect(out).toBe(`![A diagram](/images/blog/post/${img.id}.webp)\n`);
  });

  it("renders a GFM table with a header row", () => {
    const out = convert([
      block("table", { has_column_header: true }, [
        block("table_row", { cells: [[rt("H1")], [rt("H2")]] }),
        block("table_row", { cells: [[rt("a")], [rt("b")]] }),
      ]),
    ]);
    expect(out).toBe("| H1 | H2 |\n| --- | --- |\n| a | b |\n");
  });
});

describe("blocksToMarkdown — unsupported blocks", () => {
  it("skips unknown blocks and reports them as warnings", () => {
    const warnings: string[] = [];
    const out = blocksToMarkdown(
      [
        block("paragraph", { rich_text: [rt("kept")] }),
        block("synced_block", {}),
        block("child_page", { title: "Private notes" }),
      ],
      { ...ctx, onWarning: (w) => warnings.push(w) },
    );
    expect(out).toBe("kept\n");
    expect(warnings).toEqual([
      "skipped unsupported block: synced_block",
      "skipped unsupported block: child_page",
    ]);
  });

  it("flattens a toggle into its summary plus children", () => {
    const out = convert([
      block("toggle", { rich_text: [rt("Summary")] }, [
        block("paragraph", { rich_text: [rt("Inner.")] }),
      ]),
    ]);
    expect(out).toBe("Summary\n\nInner.\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/notion/__tests__/blocks-to-md.test.ts`
Expected: FAIL — cannot resolve `@/lib/notion/blocks-to-md`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/notion/blocks-to-md.ts
import type { MdBlock, RichText } from "./types";
import { richTextToMarkdown } from "./rich-text";

export type ConvertContext = {
  // Site-relative path for an image block, produced by the image capture step.
  // Injected so this module stays pure and testable.
  imagePath: (blockId: string) => string;
  onWarning?: (message: string) => void;
};

// Notion's language names → Shiki identifiers. Anything unlisted renders as
// plain text rather than failing the build.
const LANGUAGE_MAP: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  "plain text": "text",
  bash: "bash",
  shell: "bash",
  json: "json",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  "c++": "cpp",
  "c#": "csharp",
  css: "css",
  html: "html",
  markdown: "md",
  sql: "sql",
  yaml: "yaml",
  diff: "diff",
};

const HEADING_PREFIX: Record<string, string> = {
  // Shifted down one level: the post title is already the page <h1>.
  heading_1: "##",
  heading_2: "###",
  heading_3: "####",
};

export function blocksToMarkdown(
  blocks: MdBlock[],
  ctx: ConvertContext,
): string {
  const chunks = render(blocks, ctx, 0);
  return chunks.length === 0 ? "" : `${chunks.join("\n\n")}\n`;
}

function render(blocks: MdBlock[], ctx: ConvertContext, depth: number): string[] {
  const out: string[] = [];
  let ordinal = 0;

  for (const block of blocks) {
    if (block.type !== "numbered_list_item") ordinal = 0;

    switch (block.type) {
      case "paragraph": {
        const text = inline(block, "paragraph");
        if (text) out.push(text);
        break;
      }
      case "heading_1":
      case "heading_2":
      case "heading_3": {
        const text = inline(block, block.type);
        if (text) out.push(`${HEADING_PREFIX[block.type]} ${text}`);
        break;
      }
      case "quote": {
        const text = inline(block, "quote");
        if (text) out.push(`> ${text}`);
        break;
      }
      case "callout": {
        const payload = block.callout as { icon?: { emoji?: string } };
        const emoji = payload?.icon?.emoji;
        const text = inline(block, "callout");
        if (text) out.push(emoji ? `> ${emoji} ${text}` : `> ${text}`);
        break;
      }
      case "divider":
        out.push("---");
        break;
      case "bulleted_list_item":
        out.push(listItem(block, ctx, depth, "- "));
        break;
      case "numbered_list_item":
        ordinal += 1;
        out.push(listItem(block, ctx, depth, `${ordinal}. `));
        break;
      case "to_do": {
        const payload = block.to_do as { checked?: boolean };
        const marker = payload?.checked ? "- [x] " : "- [ ] ";
        out.push(listItem(block, ctx, depth, marker));
        break;
      }
      case "code": {
        const payload = block.code as { language?: string };
        const language = LANGUAGE_MAP[payload?.language ?? ""] ?? "text";
        // Code contents are never MDX-escaped — MDX does not parse fenced code.
        const source = plainText(block, "code");
        out.push(`\`\`\`${language}\n${source}\n\`\`\``);
        break;
      }
      case "image": {
        const payload = block.image as { caption?: RichText[] };
        const alt = richTextToMarkdown(payload?.caption ?? []);
        out.push(`![${alt}](${ctx.imagePath(block.id)})`);
        break;
      }
      case "table":
        out.push(table(block));
        break;
      case "bookmark":
      case "link_preview": {
        const payload = block[block.type] as { url?: string };
        if (payload?.url) out.push(`[${payload.url}](${payload.url})`);
        break;
      }
      case "toggle": {
        const summary = inline(block, "toggle");
        if (summary) out.push(summary);
        out.push(...render(block.children, ctx, depth));
        break;
      }
      default:
        ctx.onWarning?.(`skipped unsupported block: ${block.type}`);
    }
  }

  return out;
}

// A list item plus any nested children, indented two spaces per level.
function listItem(
  block: MdBlock,
  ctx: ConvertContext,
  depth: number,
  marker: string,
): string {
  const indent = "  ".repeat(depth);
  const lines = [`${indent}${marker}${inline(block, block.type)}`];
  if (block.children.length > 0) {
    lines.push(...render(block.children, ctx, depth + 1));
  }
  return lines.join("\n");
}

function table(block: MdBlock): string {
  const payload = block.table as { has_column_header?: boolean };
  const rows = block.children
    .filter((child) => child.type === "table_row")
    .map((child) => {
      const cells = (child.table_row as { cells?: RichText[][] })?.cells ?? [];
      return cells.map((cell) => richTextToMarkdown(cell));
    });
  if (rows.length === 0) return "";

  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;

  // GFM requires a delimiter row. Without an explicit header, emit an empty one
  // so every row renders as a body row.
  const header = payload?.has_column_header ? rows[0] : Array(width).fill("");
  const body = payload?.has_column_header ? rows.slice(1) : rows;
  const delimiter = `| ${Array(width).fill("---").join(" | ")} |`;

  return [line(header), delimiter, ...body.map(line)].join("\n");
}

function richTextOf(block: MdBlock, key: string): RichText[] {
  return ((block[key] as { rich_text?: RichText[] })?.rich_text ?? []) as RichText[];
}

function inline(block: MdBlock, key: string): string {
  return richTextToMarkdown(richTextOf(block, key));
}

function plainText(block: MdBlock, key: string): string {
  return richTextOf(block, key)
    .map((node) => node.plain_text)
    .join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/notion/__tests__/blocks-to-md.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notion/blocks-to-md.ts src/lib/notion/__tests__/blocks-to-md.test.ts
git commit -m "feat(notion): convert block trees to markdown

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Serialization and the content projection

**Files:**
- Create: `src/lib/notion/serialize.ts`
- Test: `src/lib/notion/__tests__/serialize.test.ts`

**Interfaces:**
- Consumes: `PostFrontmatter` (Task 1).
- Produces: `serializePost(fm: PostFrontmatter, body: string): string`, `contentProjection(mdx: string): string`, `resolveUpdated(next: string, existing: string | undefined): string`.

**Why `contentProjection` exists (spec §7):** Notion's `last_edited_time` changes when you so much as open a page. If `updated` alone triggered a write, the sync would commit and redeploy on every no-op edit. The projection strips `updated` so two files can be compared on content only.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notion/__tests__/serialize.test.ts
import { describe, it, expect } from "vitest";
import {
  serializePost,
  contentProjection,
  resolveUpdated,
} from "@/lib/notion/serialize";
import type { PostFrontmatter } from "@/lib/notion/types";

const fm: PostFrontmatter = {
  title: "Grounding agents",
  date: "2026-05-20",
  excerpt: "Why retrieval beats prompt-stuffing.",
  tags: ["AI", "Distributed Systems"],
  updated: "2026-06-01",
};

describe("serializePost", () => {
  it("writes frontmatter keys in a fixed order with one trailing newline", () => {
    expect(serializePost(fm, "Body text.\n")).toBe(
      [
        "---",
        'title: "Grounding agents"',
        'date: "2026-05-20"',
        'excerpt: "Why retrieval beats prompt-stuffing."',
        'tags: ["AI", "Distributed Systems"]',
        'updated: "2026-06-01"',
        "---",
        "",
        "Body text.",
        "",
      ].join("\n"),
    );
  });

  it("escapes double quotes and backslashes in string values", () => {
    const out = serializePost({ ...fm, title: 'He said "hi" \\ bye' }, "x\n");
    expect(out).toContain('title: "He said \\"hi\\" \\\\ bye"');
  });

  it("emits an empty array for no tags", () => {
    expect(serializePost({ ...fm, tags: [] }, "x\n")).toContain("tags: []");
  });

  it("normalizes CRLF and collapses trailing blank lines", () => {
    const out = serializePost(fm, "a\r\nb\n\n\n");
    expect(out.endsWith("a\nb\n")).toBe(true);
    expect(out).not.toContain("\r");
  });
});

describe("contentProjection", () => {
  it("ignores the updated line so it can compare on content alone", () => {
    const a = serializePost(fm, "Body.\n");
    const b = serializePost({ ...fm, updated: "2099-01-01" }, "Body.\n");
    expect(a).not.toBe(b);
    expect(contentProjection(a)).toBe(contentProjection(b));
  });

  it("still distinguishes real content changes", () => {
    const a = serializePost(fm, "Body.\n");
    const b = serializePost(fm, "Different body.\n");
    expect(contentProjection(a)).not.toBe(contentProjection(b));
  });

  it("distinguishes frontmatter changes other than updated", () => {
    const a = serializePost(fm, "Body.\n");
    const b = serializePost({ ...fm, title: "Other" }, "Body.\n");
    expect(contentProjection(a)).not.toBe(contentProjection(b));
  });
});

describe("resolveUpdated", () => {
  it("keeps the existing value when content is unchanged", () => {
    expect(resolveUpdated("2026-08-03", "2026-06-01")).toBe("2026-06-01");
  });

  it("uses the new value when there is no existing file", () => {
    expect(resolveUpdated("2026-08-03", undefined)).toBe("2026-08-03");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/notion/__tests__/serialize.test.ts`
Expected: FAIL — cannot resolve `@/lib/notion/serialize`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/notion/serialize.ts
import type { PostFrontmatter } from "./types";

// Frontmatter key order is fixed so identical content always serializes to
// identical bytes — a prerequisite for the sync being idempotent (spec §7).
const KEY_ORDER = ["title", "date", "excerpt", "tags", "updated"] as const;

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function serializePost(fm: PostFrontmatter, body: string): string {
  const lines = KEY_ORDER.map((key) =>
    key === "tags"
      ? `tags: [${fm.tags.map(quote).join(", ")}]`
      : `${key}: ${quote(fm[key])}`,
  );
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return `---\n${lines.join("\n")}\n---\n\n${normalizedBody}\n`;
}

// The content-relevant view of a file: everything except `updated`. Two files
// with the same projection represent the same post, even if Notion's
// last_edited_time moved because the page was merely opened.
export function contentProjection(mdx: string): string {
  return mdx
    .split("\n")
    .filter((line) => !line.startsWith("updated: "))
    .join("\n");
}

// Preserve the on-disk `updated` when nothing about the content changed;
// otherwise adopt the new timestamp.
export function resolveUpdated(
  next: string,
  existing: string | undefined,
): string {
  return existing ?? next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/notion/__tests__/serialize.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notion/serialize.ts src/lib/notion/__tests__/serialize.test.ts
git commit -m "feat(notion): serialize posts with a stable content projection

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Fail-closed validation

**Files:**
- Create: `src/lib/notion/validate.ts`
- Test: `src/lib/notion/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `PostSource` (Task 1), `isValidSlug` (Task 1).
- Produces: `validatePosts(posts: ValidatablePost[]): string[]` and `type ValidatablePost = { slug: string; frontmatter: PostFrontmatter; body: string }`.

**Contract:** returns **every** error rather than throwing on the first, so one run surfaces all problems. An empty array means safe to write.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notion/__tests__/validate.test.ts
import { describe, it, expect } from "vitest";
import { validatePosts, type ValidatablePost } from "@/lib/notion/validate";

const ok: ValidatablePost = {
  slug: "a-good-post",
  frontmatter: {
    title: "A good post",
    date: "2026-05-20",
    excerpt: "A short summary.",
    tags: ["AI"],
    updated: "2026-05-20",
  },
  body: "Real content.\n",
};

const withFm = (over: Partial<ValidatablePost["frontmatter"]>): ValidatablePost => ({
  ...ok,
  frontmatter: { ...ok.frontmatter, ...over },
});

describe("validatePosts", () => {
  it("returns no errors for a valid post", () => {
    expect(validatePosts([ok])).toEqual([]);
  });

  it("rejects an empty title", () => {
    expect(validatePosts([withFm({ title: "  " })])).toEqual([
      'a-good-post: title is empty',
    ]);
  });

  it("rejects a missing or unparseable date", () => {
    expect(validatePosts([withFm({ date: "" })])[0]).toContain("date");
    expect(validatePosts([withFm({ date: "May 20, 2026" })])[0]).toContain("date");
    expect(validatePosts([withFm({ date: "2026-02-31" })])[0]).toContain("date");
  });

  it("rejects an empty excerpt", () => {
    expect(validatePosts([withFm({ excerpt: "" })])[0]).toContain("excerpt");
  });

  it("rejects an excerpt over 200 characters", () => {
    expect(validatePosts([withFm({ excerpt: "x".repeat(201) })])[0]).toContain(
      "excerpt",
    );
  });

  it("rejects an invalid slug", () => {
    expect(validatePosts([{ ...ok, slug: "Not A Slug" }])[0]).toContain("slug");
  });

  it("rejects duplicate slugs, naming the slug once", () => {
    const errors = validatePosts([ok, { ...ok, body: "Other.\n" }]);
    expect(errors).toEqual(['a-good-post: duplicate slug (2 posts share it)']);
  });

  it("rejects an empty body", () => {
    expect(validatePosts([{ ...ok, body: "  \n" }])[0]).toContain("body");
  });

  it("accumulates every error rather than stopping at the first", () => {
    const broken: ValidatablePost = {
      slug: "BAD SLUG",
      frontmatter: { title: "", date: "nope", excerpt: "", tags: [], updated: "" },
      body: "",
    };
    expect(validatePosts([broken]).length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/notion/__tests__/validate.test.ts`
Expected: FAIL — cannot resolve `@/lib/notion/validate`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/notion/validate.ts
import type { PostFrontmatter } from "./types";
import { isValidSlug } from "./slug";

export type ValidatablePost = {
  slug: string;
  frontmatter: PostFrontmatter;
  body: string;
};

const MAX_EXCERPT = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A date is valid only if it round-trips: `2026-02-31` parses in JS but rolls
// over to March, which would silently mis-date a post.
function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

// Collects every problem across every post. The sync writes nothing unless this
// returns an empty array, so a malformed post can never reach production.
export function validatePosts(posts: ValidatablePost[]): string[] {
  const errors: string[] = [];

  for (const post of posts) {
    const at = (message: string) => `${post.slug}: ${message}`;
    const { title, date, excerpt } = post.frontmatter;

    if (title.trim() === "") errors.push(at("title is empty"));
    if (!isValidDate(date)) {
      errors.push(at(`date must be a valid YYYY-MM-DD value (got ${JSON.stringify(date)})`));
    }
    if (excerpt.trim() === "") errors.push(at("excerpt is empty"));
    else if (excerpt.length > MAX_EXCERPT) {
      errors.push(at(`excerpt is ${excerpt.length} chars (max ${MAX_EXCERPT})`));
    }
    if (!isValidSlug(post.slug)) {
      errors.push(at("slug must be lowercase alphanumeric with single hyphens"));
    }
    if (post.body.trim() === "") errors.push(at("body is empty after conversion"));
  }

  const counts = new Map<string, number>();
  for (const post of posts) {
    counts.set(post.slug, (counts.get(post.slug) ?? 0) + 1);
  }
  for (const [slug, count] of counts) {
    if (count > 1) errors.push(`${slug}: duplicate slug (${count} posts share it)`);
  }

  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/notion/__tests__/validate.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notion/validate.ts src/lib/notion/__tests__/validate.test.ts
git commit -m "feat(notion): add fail-closed post validation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Image naming and reconciliation planning

**Files:**
- Create: `src/lib/notion/images.ts`
- Create: `src/lib/notion/reconcile.ts`
- Test: `src/lib/notion/__tests__/images.test.ts`
- Test: `src/lib/notion/__tests__/reconcile.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `imageFileName(bytes: Uint8Array, contentType: string): string`, `imageDir(slug: string): string`, `MAX_IMAGE_BYTES`, `downloadImage(url: string, fetchImpl?: typeof fetch): Promise<{ bytes: Uint8Array; contentType: string }>`, and `planReconcile(desired: Map<string,string>, existing: Map<string,string>): { write: string[]; delete: string[]; unchanged: string[] }`.

**Why content-addressed names (spec §6):** an unchanged image hashes to the same filename, so re-uploading the same picture in Notion produces no diff. This is what makes the 10-minute cron safe.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/notion/__tests__/images.test.ts
import { describe, it, expect } from "vitest";
import {
  imageFileName,
  imageDir,
  downloadImage,
  MAX_IMAGE_BYTES,
} from "@/lib/notion/images";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("imageFileName", () => {
  it("is deterministic for identical bytes", () => {
    expect(imageFileName(bytes("abc"), "image/png")).toBe(
      imageFileName(bytes("abc"), "image/png"),
    );
  });

  it("differs for different bytes", () => {
    expect(imageFileName(bytes("abc"), "image/png")).not.toBe(
      imageFileName(bytes("xyz"), "image/png"),
    );
  });

  it("uses a 12-character hash and the mapped extension", () => {
    expect(imageFileName(bytes("abc"), "image/png")).toMatch(/^[0-9a-f]{12}\.png$/);
    expect(imageFileName(bytes("abc"), "image/webp")).toMatch(/\.webp$/);
    expect(imageFileName(bytes("abc"), "image/jpeg")).toMatch(/\.jpg$/);
    expect(imageFileName(bytes("abc"), "image/gif")).toMatch(/\.gif$/);
    expect(imageFileName(bytes("abc"), "image/svg+xml")).toMatch(/\.svg$/);
  });

  it("ignores content-type parameters", () => {
    expect(imageFileName(bytes("abc"), "image/png; charset=binary")).toMatch(
      /\.png$/,
    );
  });

  it("falls back to .bin for unknown types", () => {
    expect(imageFileName(bytes("abc"), "application/octet-stream")).toMatch(
      /\.bin$/,
    );
  });
});

describe("imageDir", () => {
  it("namespaces images by post slug", () => {
    expect(imageDir("my-post")).toBe("public/images/blog/my-post");
  });
});

describe("downloadImage", () => {
  it("returns bytes and content type", async () => {
    const fake = async () =>
      new Response(bytes("png-data"), {
        headers: { "content-type": "image/png" },
      });
    const result = await downloadImage("https://s3/signed", fake as typeof fetch);
    expect(new TextDecoder().decode(result.bytes)).toBe("png-data");
    expect(result.contentType).toBe("image/png");
  });

  it("throws on a non-OK response", async () => {
    const fake = async () => new Response("nope", { status: 403 });
    await expect(
      downloadImage("https://s3/expired", fake as typeof fetch),
    ).rejects.toThrow(/403/);
  });

  it("throws when the payload exceeds the size cap", async () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const fake = async () =>
      new Response(huge, { headers: { "content-type": "image/png" } });
    await expect(
      downloadImage("https://s3/huge", fake as typeof fetch),
    ).rejects.toThrow(/too large/i);
  });
});
```

```ts
// src/lib/notion/__tests__/reconcile.test.ts
import { describe, it, expect } from "vitest";
import { planReconcile } from "@/lib/notion/reconcile";

describe("planReconcile", () => {
  it("writes new files", () => {
    const plan = planReconcile(new Map([["a.mdx", "A"]]), new Map());
    expect(plan).toEqual({ write: ["a.mdx"], delete: [], unchanged: [] });
  });

  it("leaves identical files alone", () => {
    const plan = planReconcile(
      new Map([["a.mdx", "A"]]),
      new Map([["a.mdx", "A"]]),
    );
    expect(plan).toEqual({ write: [], delete: [], unchanged: ["a.mdx"] });
  });

  it("rewrites changed files", () => {
    const plan = planReconcile(
      new Map([["a.mdx", "A2"]]),
      new Map([["a.mdx", "A"]]),
    );
    expect(plan).toEqual({ write: ["a.mdx"], delete: [], unchanged: [] });
  });

  it("deletes orphans", () => {
    const plan = planReconcile(new Map(), new Map([["gone.mdx", "G"]]));
    expect(plan).toEqual({ write: [], delete: ["gone.mdx"], unchanged: [] });
  });

  it("returns paths sorted so runs are deterministic", () => {
    const plan = planReconcile(
      new Map([["b.mdx", "B"], ["a.mdx", "A"]]),
      new Map([["z.mdx", "Z"], ["y.mdx", "Y"]]),
    );
    expect(plan.write).toEqual(["a.mdx", "b.mdx"]);
    expect(plan.delete).toEqual(["y.mdx", "z.mdx"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/notion/__tests__/images.test.ts src/lib/notion/__tests__/reconcile.test.ts`
Expected: FAIL — cannot resolve `@/lib/notion/images` or `@/lib/notion/reconcile`.

- [ ] **Step 3: Write `images.ts`**

```ts
// src/lib/notion/images.ts
import { createHash } from "node:crypto";

// Notion's free tier caps uploads at 5 MB; this leaves headroom while still
// refusing anything that would bloat the repo.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

// Content-addressed: identical bytes always produce the same filename, so an
// unchanged image yields no diff and the 10-minute cron stays quiet (spec §6).
export function imageFileName(bytes: Uint8Array, contentType: string): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return `${hash}.${EXTENSIONS[mime] ?? "bin"}`;
}

export function imageDir(slug: string): string {
  return `public/images/blog/${slug}`;
}

// Notion's file URLs are signed and expire one hour after they are issued, so
// this must run while the URL from the current fetch is still fresh.
export async function downloadImage(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`image download failed: ${response.status} ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `image too large: ${bytes.byteLength} bytes (max ${MAX_IMAGE_BYTES}) ${url}`,
    );
  }
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}
```

- [ ] **Step 4: Write `reconcile.ts`**

```ts
// src/lib/notion/reconcile.ts

export type ReconcilePlan = {
  write: string[];
  delete: string[];
  unchanged: string[];
};

// Compares the desired file set against what is on disk and returns the minimal
// set of operations. Paths are sorted so two runs over the same input produce
// identical plans and identical log output.
export function planReconcile(
  desired: Map<string, string>,
  existing: Map<string, string>,
): ReconcilePlan {
  const write: string[] = [];
  const unchanged: string[] = [];

  for (const [path, contents] of desired) {
    if (existing.get(path) === contents) unchanged.push(path);
    else write.push(path);
  }

  const remove = [...existing.keys()].filter((path) => !desired.has(path));

  return {
    write: write.sort(),
    delete: remove.sort(),
    unchanged: unchanged.sort(),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/notion/__tests__/images.test.ts src/lib/notion/__tests__/reconcile.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notion/images.ts src/lib/notion/reconcile.ts src/lib/notion/__tests__/images.test.ts src/lib/notion/__tests__/reconcile.test.ts
git commit -m "feat(notion): content-addressed images and reconcile planning

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Idempotency test

**Files:**
- Modify: `src/lib/notion/__tests__/fixtures/blocks.ts` (add `samplePost`)
- Test: `src/lib/notion/__tests__/idempotency.test.ts`

**Interfaces:**
- Consumes: `blocksToMarkdown` (Task 3), `serializePost`/`contentProjection`/`resolveUpdated` (Task 4), `imageFileName` (Task 6), `planReconcile` (Task 6).
- Produces: nothing consumed by later tasks — this is the guard rail that proves spec §7.

**Why this is its own task:** the sync runs 144 times a day. A spurious diff means 144 commits and 144 deploys. This test is the contract that prevents it, and it must fail loudly if anyone breaks determinism later.

- [ ] **Step 1: Add the sample post fixture**

```ts
// append to src/lib/notion/__tests__/fixtures/blocks.ts
import type { MdBlock } from "@/lib/notion/types";

// A post exercising every construct that could plausibly be unstable across
// runs: nested lists, a table, code, an image, and inline annotations.
export function samplePost(): MdBlock[] {
  return [
    block("heading_1", { rich_text: [rt("A minimal tool")] }),
    block("paragraph", {
      rich_text: [
        rt("Keep the surface small — see "),
        rt("searchDocs", { code: true }),
        rt(" and the "),
        rt("docs", { href: "https://example.com" }),
        rt("."),
      ],
    }),
    block("code", {
      rich_text: [rt("const hits = await index.search(q, { topK: 5 });")],
      language: "typescript",
    }),
    block("bulleted_list_item", { rich_text: [rt("outer")] }, [
      block("bulleted_list_item", { rich_text: [rt("inner")] }),
    ]),
    block("numbered_list_item", { rich_text: [rt("first")] }),
    block("numbered_list_item", { rich_text: [rt("second")] }),
    block("table", { has_column_header: true }, [
      block("table_row", { cells: [[rt("Metric")], [rt("Value")]] }),
      block("table_row", { cells: [[rt("p99")], [rt("120ms")]] }),
    ]),
    block("image", {
      type: "file",
      file: { url: "https://s3/signed" },
      caption: [rt("A diagram")],
    }),
    block("quote", { rich_text: [rt("Then delete the panels you never open.")] }),
  ];
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/notion/__tests__/idempotency.test.ts
import { describe, it, expect } from "vitest";
import { blocksToMarkdown } from "@/lib/notion/blocks-to-md";
import {
  serializePost,
  contentProjection,
  resolveUpdated,
} from "@/lib/notion/serialize";
import { imageFileName } from "@/lib/notion/images";
import { planReconcile } from "@/lib/notion/reconcile";
import type { PostFrontmatter } from "@/lib/notion/types";
import { samplePost } from "./fixtures/blocks";

const ctx = { imagePath: (id: string) => `/images/blog/sample/${id}.png` };
const fm: PostFrontmatter = {
  title: "A minimal tool",
  date: "2026-05-20",
  excerpt: "Keep the surface small.",
  tags: ["AI"],
  updated: "2026-05-20",
};

describe("sync idempotency (spec §7)", () => {
  it("converts the same blocks to byte-identical markdown", () => {
    expect(blocksToMarkdown(samplePost(), ctx)).toBe(
      blocksToMarkdown(samplePost(), ctx),
    );
  });

  it("serializes the same post to byte-identical mdx", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    expect(serializePost(fm, body)).toBe(serializePost(fm, body));
  });

  it("hashes the same image bytes to the same filename", () => {
    const bytes = new TextEncoder().encode("image-payload");
    expect(imageFileName(bytes, "image/png")).toBe(
      imageFileName(bytes, "image/png"),
    );
  });

  it("plans no writes when a re-run produces the same content", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    const file = serializePost(fm, body);
    const plan = planReconcile(
      new Map([["content/blog/sample.mdx", file]]),
      new Map([["content/blog/sample.mdx", file]]),
    );
    expect(plan.write).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it("plans no writes when only Notion's last_edited_time moved", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    const onDisk = serializePost(fm, body);

    // Simulate the sync: content is unchanged, so `updated` is carried over
    // from the existing file rather than adopting the newer Notion timestamp.
    const existingUpdated = onDisk
      .split("\n")
      .find((line) => line.startsWith("updated: "))!
      .slice('updated: "'.length, -1);
    const candidate = serializePost({ ...fm, updated: "2099-12-31" }, body);
    const carried = serializePost(
      {
        ...fm,
        updated:
          contentProjection(candidate) === contentProjection(onDisk)
            ? resolveUpdated("2099-12-31", existingUpdated)
            : "2099-12-31",
      },
      body,
    );

    const plan = planReconcile(
      new Map([["content/blog/sample.mdx", carried]]),
      new Map([["content/blog/sample.mdx", onDisk]]),
    );
    expect(plan.write).toEqual([]);
  });

  it("DOES plan a write when the body actually changes", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    const plan = planReconcile(
      new Map([["content/blog/sample.mdx", serializePost(fm, `${body}More.\n`)]]),
      new Map([["content/blog/sample.mdx", serializePost(fm, body)]]),
    );
    expect(plan.write).toEqual(["content/blog/sample.mdx"]);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm exec vitest run src/lib/notion/__tests__/idempotency.test.ts`
Expected: PASS — the pure modules from Tasks 3, 4, and 6 already satisfy this. If any case fails, the determinism bug is in those modules; fix it there rather than weakening this test.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS — existing suites plus the new Notion suites.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notion/__tests__/idempotency.test.ts src/lib/notion/__tests__/fixtures/blocks.ts
git commit -m "test(notion): prove the sync pipeline is idempotent

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Notion client and post fetching

**Files:**
- Modify: `package.json` (add `@notionhq/client`, `tsx`)
- Create: `src/lib/notion/client.ts`
- Create: `src/lib/notion/fetch-post.ts`

**Interfaces:**
- Consumes: `MdBlock`, `PostSource`, `PostFrontmatter` (Task 1), `slugify` (Task 1).
- Produces: `createNotionClient(token: string): Client`, `resolveDataSourceId(client, databaseId): Promise<string>`, `queryPublishedPages(client, dataSourceId): Promise<PageObject[]>`, `fetchBlockTree(client, blockId): Promise<MdBlock[]>`, `toPostSource(page: PageObject, blocks: MdBlock[]): PostSource`.

**API notes (spec §4):** version `2026-03-11`. Databases and data sources split in `2025-09-03`, so query goes through `/v1/data_sources/:id/query`, and the data source id comes from `GET /v1/databases/:id` → `data_sources[0].id`.

- [ ] **Step 1: Install dependencies**

```bash
pnpm add @notionhq/client
pnpm add -D tsx
```

Expected: both resolve to releases older than 7 days under `minimumReleaseAge`. Neither needs a build script, so `allowBuilds` in `pnpm-workspace.yaml` is unchanged.

- [ ] **Step 2: Verify the SDK surface before writing against it**

The client code below was written against Notion's published docs, **not** against the installed package's types. Check the real surface now:

```bash
ls node_modules/@notionhq/client/build/src/
grep -rn "dataSources\|data_sources" node_modules/@notionhq/client/build/src/Client.d.ts | head -20
grep -n "notionVersion" node_modules/@notionhq/client/build/src/Client.d.ts | head -5
```

Two things to confirm, and **prefer the typed method wherever one exists**:

1. **Data source query.** If the SDK exposes a typed method (e.g. `client.dataSources.query({ data_source_id, filter, start_cursor, page_size })`), use it in `queryPublishedPages` instead of the raw `client.request({ path: "data_sources/.../query" })` shown below. The raw form is a documented escape hatch and works either way, but the typed method gives real parameter and response types.
2. **`databases.retrieve` response.** Confirm it returns a `data_sources` array on this version. If the type does not include it, keep the `as unknown as { data_sources?: ... }` cast below and leave the comment explaining why.

Also confirm the constructor accepts `notionVersion`. If the option is named differently, adjust `createNotionClient` accordingly — the version string `2026-03-11` itself does not change.

Record whatever you find in the Task 8 commit message so the next reader knows which form was chosen and why.

- [ ] **Step 3: Write `client.ts`**

```ts
// src/lib/notion/client.ts
import { Client } from "@notionhq/client";
import type { MdBlock } from "./types";

// Pinned explicitly: `archived` became `in_trash` in this version, and database
// queries moved to /v1/data_sources/:id/query in 2025-09-03.
export const NOTION_VERSION = "2026-03-11";

export type PageObject = {
  id: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
};

export function createNotionClient(token: string): Client {
  return new Client({ auth: token, notionVersion: NOTION_VERSION });
}

// Notion allows ~3 requests/second per integration. Retry 429s honoring
// Retry-After so a burst of image-heavy posts degrades to slow, not failed.
async function withRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      if (status !== 429 || attempt >= attempts) throw error;
      const header = (error as { headers?: Record<string, string> }).headers?.[
        "retry-after"
      ];
      const waitMs = (Number(header) || attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

// A database is a container; its schema and rows live in a data source.
export async function resolveDataSourceId(
  client: Client,
  databaseId: string,
): Promise<string> {
  const database = (await withRetry(() =>
    client.databases.retrieve({ database_id: databaseId }),
  )) as unknown as { data_sources?: { id: string }[] };

  const id = database.data_sources?.[0]?.id;
  if (!id) {
    throw new Error(
      `database ${databaseId} exposes no data sources — check the integration is connected to it`,
    );
  }
  return id;
}

export async function queryPublishedPages(
  client: Client,
  dataSourceId: string,
): Promise<PageObject[]> {
  const pages: PageObject[] = [];
  let cursor: string | undefined;

  do {
    const response = (await withRetry(() =>
      client.request({
        path: `data_sources/${dataSourceId}/query`,
        method: "post",
        body: {
          filter: { property: "Status", status: { equals: "Published" } },
          start_cursor: cursor,
          page_size: 100,
        },
      }),
    )) as { results: PageObject[]; next_cursor: string | null; has_more: boolean };

    pages.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

// Depth-first walk resolving every child list. Notion paginates children at 100.
export async function fetchBlockTree(
  client: Client,
  blockId: string,
): Promise<MdBlock[]> {
  const blocks: MdBlock[] = [];
  let cursor: string | undefined;

  do {
    const response = await withRetry(() =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );

    for (const result of response.results as unknown as MdBlock[]) {
      const children = result.has_children
        ? await fetchBlockTree(client, result.id)
        : [];
      blocks.push({ ...result, children });
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}
```

- [ ] **Step 4: Write `fetch-post.ts`**

```ts
// src/lib/notion/fetch-post.ts
import type { PageObject } from "./client";
import type { MdBlock, PostSource, PostFrontmatter } from "./types";
import { slugify } from "./slug";

type Property = Record<string, unknown>;

function plain(property: Property | undefined): string {
  const runs = (property?.rich_text ?? property?.title) as
    | { plain_text: string }[]
    | undefined;
  return (runs ?? []).map((run) => run.plain_text).join("").trim();
}

function multiSelect(property: Property | undefined): string[] {
  const options = property?.multi_select as { name: string }[] | undefined;
  return (options ?? []).map((option) => option.name);
}

function dateStart(property: Property | undefined): string {
  return ((property?.date as { start?: string } | undefined)?.start ?? "").slice(
    0,
    10,
  );
}

// Maps a Notion page's properties onto post frontmatter. `updated` comes from
// the page's last_edited_time; no Notion property is needed for it.
export function toPostSource(page: PageObject, blocks: MdBlock[]): PostSource {
  const properties = page.properties as Record<string, Property>;
  const title = plain(properties.Title);
  const explicitSlug = plain(properties.Slug);

  const frontmatter: PostFrontmatter = {
    title,
    date: dateStart(properties.Published),
    excerpt: plain(properties.Excerpt),
    tags: multiSelect(properties.Tags),
    updated: page.last_edited_time.slice(0, 10),
  };

  return {
    pageId: page.id,
    slug: explicitSlug === "" ? slugify(title) : slugify(explicitSlug),
    frontmatter,
    blocks,
  };
}
```

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/notion/client.ts src/lib/notion/fetch-post.ts
git commit -m "feat(notion): add API client and page fetching

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The sync script

**Files:**
- Create: `scripts/sync-notion.ts`
- Modify: `package.json` (add the `sync:notion` script)

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: the `pnpm sync:notion` and `pnpm sync:notion --check` commands.

**Contract:** validates before writing anything. On any validation error it prints every problem and exits 1 with the working tree untouched.

- [ ] **Step 1: Write the script**

```ts
// scripts/sync-notion.ts
import fs from "node:fs/promises";
import path from "node:path";
import { createNotionClient, resolveDataSourceId, queryPublishedPages, fetchBlockTree } from "../src/lib/notion/client";
import { toPostSource } from "../src/lib/notion/fetch-post";
import { blocksToMarkdown } from "../src/lib/notion/blocks-to-md";
import { serializePost, contentProjection, resolveUpdated } from "../src/lib/notion/serialize";
import { validatePosts, type ValidatablePost } from "../src/lib/notion/validate";
import { planReconcile } from "../src/lib/notion/reconcile";
import { downloadImage, imageFileName, imageDir } from "../src/lib/notion/images";
import type { MdBlock, PostSource } from "../src/lib/notion/types";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "content", "blog");
const CHECK_ONLY = process.argv.includes("--check");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

// Walks a post's block tree, downloads every image while its signed URL is
// still valid (they expire after one hour), and returns a blockId → path map.
async function captureImages(
  post: PostSource,
): Promise<{ paths: Map<string, string>; files: Map<string, Uint8Array> }> {
  const paths = new Map<string, string>();
  const files = new Map<string, Uint8Array>();

  const walk = async (blocks: MdBlock[]): Promise<void> => {
    for (const block of blocks) {
      if (block.type === "image") {
        const payload = block.image as {
          type?: string;
          file?: { url: string };
          external?: { url: string };
        };
        const url = payload.file?.url ?? payload.external?.url;
        if (url) {
          const { bytes, contentType } = await downloadImage(url);
          const name = imageFileName(bytes, contentType);
          files.set(path.join(imageDir(post.slug), name), bytes);
          paths.set(block.id, `/images/blog/${post.slug}/${name}`);
        }
      }
      await walk(block.children);
    }
  };

  await walk(post.blocks);
  return { paths, files };
}

async function readExisting(dir: string): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return existing;
  }
  for (const name of names) {
    if (name.endsWith(".mdx")) {
      existing.set(
        path.join("content", "blog", name),
        await fs.readFile(path.join(dir, name), "utf8"),
      );
    }
  }
  return existing;
}

function existingUpdated(mdx: string | undefined): string | undefined {
  const line = mdx?.split("\n").find((l) => l.startsWith("updated: "));
  return line?.slice('updated: "'.length, -1);
}

async function main(): Promise<void> {
  const client = createNotionClient(requireEnv("NOTION_TOKEN"));
  const dataSourceId = await resolveDataSourceId(
    client,
    requireEnv("NOTION_DATABASE_ID"),
  );

  const pages = await queryPublishedPages(client, dataSourceId);
  const warnings: string[] = [];
  const desired = new Map<string, string>();
  const imageFiles = new Map<string, Uint8Array>();
  const validatable: ValidatablePost[] = [];

  const existing = await readExisting(BLOG_DIR);

  // Stable ordering keeps logs and any downstream diff deterministic.
  const sources = (
    await Promise.all(
      pages.map(async (page) =>
        toPostSource(page, await fetchBlockTree(client, page.id)),
      ),
    )
  ).sort((a, b) =>
    a.frontmatter.date === b.frontmatter.date
      ? a.slug.localeCompare(b.slug)
      : b.frontmatter.date.localeCompare(a.frontmatter.date),
  );

  for (const post of sources) {
    const { paths, files } = await captureImages(post);
    for (const [file, bytes] of files) imageFiles.set(file, bytes);

    const body = blocksToMarkdown(post.blocks, {
      imagePath: (id) => paths.get(id) ?? "",
      onWarning: (message) => warnings.push(`${post.slug}: ${message}`),
    });

    const filePath = path.join("content", "blog", `${post.slug}.mdx`);
    const onDisk = existing.get(filePath);
    const candidate = serializePost(post.frontmatter, body);

    // Notion's last_edited_time moves whenever a page is opened. Only adopt the
    // new value when the content itself changed (spec §7).
    const unchanged =
      onDisk !== undefined &&
      contentProjection(candidate) === contentProjection(onDisk);
    const updated = unchanged
      ? resolveUpdated(post.frontmatter.updated, existingUpdated(onDisk))
      : post.frontmatter.updated;

    desired.set(filePath, serializePost({ ...post.frontmatter, updated }, body));
    validatable.push({ slug: post.slug, frontmatter: post.frontmatter, body });
  }

  const errors = validatePosts(validatable);
  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} validation error(s) — nothing written:\n`);
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }

  for (const warning of warnings) console.warn(`  warning: ${warning}`);

  const plan = planReconcile(desired, existing);

  if (CHECK_ONLY) {
    const dirty = plan.write.length + plan.delete.length;
    console.log(
      dirty === 0
        ? "✓ in sync"
        : `✗ ${dirty} file(s) would change: ${[...plan.write, ...plan.delete].join(", ")}`,
    );
    process.exit(dirty === 0 ? 0 : 1);
  }

  await fs.mkdir(BLOG_DIR, { recursive: true });
  for (const file of plan.write) {
    await fs.writeFile(path.join(ROOT, file), desired.get(file)!, "utf8");
  }
  for (const file of plan.delete) {
    await fs.rm(path.join(ROOT, file), { force: true });
    await fs.rm(path.join(ROOT, imageDir(path.basename(file, ".mdx"))), {
      recursive: true,
      force: true,
    });
  }

  // Write images, then prune any that no post references any more.
  for (const [file, bytes] of imageFiles) {
    await fs.mkdir(path.join(ROOT, path.dirname(file)), { recursive: true });
    await fs.writeFile(path.join(ROOT, file), bytes);
  }
  for (const post of sources) {
    const dir = path.join(ROOT, imageDir(post.slug));
    const kept = new Set(
      [...imageFiles.keys()]
        .filter((file) => file.startsWith(imageDir(post.slug)))
        .map((file) => path.basename(file)),
    );
    let present: string[] = [];
    try {
      present = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of present) {
      if (!kept.has(name)) await fs.rm(path.join(dir, name), { force: true });
    }
  }

  console.log(
    `✓ ${plan.unchanged.length} unchanged, ${plan.write.length} written, ${plan.delete.length} removed`,
  );
}

main().catch((error: unknown) => {
  console.error(`✗ sync failed: ${(error as Error).message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package script**

In `package.json`, add to `"scripts"`:

```json
"sync:notion": "tsx scripts/sync-notion.ts"
```

- [ ] **Step 3: Verify it fails cleanly without credentials**

Run: `pnpm sync:notion`
Expected: exits 1 with `✗ sync failed: missing required environment variable NOTION_TOKEN`. No files written.

- [ ] **Step 4: Type-check and run the suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-notion.ts package.json
git commit -m "feat(notion): add the sync script

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: The `h4` heading style (spec §9.6)

**Files:**
- Modify: `src/components/blog/mdx-components.tsx`
- Test: `src/components/blog/__tests__/mdx-components.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: an `h4` entry in the exported `mdxComponents` map.

**Why now, not in Plan B:** Task 3 emits `####` for Notion H3. Without this style, H3 content renders unstyled in the window between the two plans.

- [ ] **Step 1: Write the failing test**

Append to `src/components/blog/__tests__/mdx-components.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { mdxComponents } from "@/components/blog/mdx-components";

describe("mdxComponents h4", () => {
  it("renders an h4 with display font styling", () => {
    const H4 = mdxComponents.h4;
    render(<H4>Fourth level</H4>);
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading).toHaveTextContent("Fourth level");
    expect(heading.className).toContain("font-display");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/blog/__tests__/mdx-components.test.tsx`
Expected: FAIL — `mdxComponents.h4` is undefined.

- [ ] **Step 3: Add the style**

In `src/components/blog/mdx-components.tsx`, after the `h3` entry:

```tsx
  h4: (p: ComponentProps<"h4">) => (
    <h4 className="mt-6 mb-2 font-display text-lg font-bold text-ink" {...p} />
  ),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/blog/__tests__/mdx-components.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/blog/mdx-components.tsx src/components/blog/__tests__/mdx-components.test.tsx
git commit -m "feat(blog): style h4 for Notion's third heading level

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: The sync workflow

**Files:**
- Create: `.github/workflows/sync-content.yml`

**Interfaces:**
- Consumes: `pnpm sync:notion` (Task 9).
- Produces: automated commits to `main` that trigger `.github/workflows/deploy.yml`.

**Critical detail (spec §10.2):** a push made with the default `GITHUB_TOKEN` **does not trigger other workflows**. Using it would sync content that never deploys. Both the checkout and the push must use the `CONTENT_SYNC_TOKEN` PAT.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/sync-content.yml
name: Sync content from Notion

on:
  schedule:
    - cron: "*/10 * * * *"
  workflow_dispatch: # the "Sync now" button

# Never let two syncs race for the same files.
concurrency: sync-content

jobs:
  sync:
    name: Pull published posts
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # A push made with the default GITHUB_TOKEN does NOT trigger other
          # workflows, so deploy.yml would never run. Use a fine-grained PAT
          # scoped to this repo with contents:write.
          token: ${{ secrets.CONTENT_SYNC_TOKEN }}
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm sync:notion
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}
      - name: Commit and push any changes
        run: |
          if [ -z "$(git status --porcelain)" ]; then
            echo "No content changes."
            exit 0
          fi
          git config user.name "elopenmike-content-bot"
          git config user.email "micasillm@gmail.com"
          git add content/blog public/images/blog
          git commit -m "content: sync from Notion"
          git push
```

- [ ] **Step 2: Verify the workflow parses**

Run: `pnpm exec prettier --check .github/workflows/sync-content.yml || true`
Then confirm on GitHub that the workflow appears under Actions after pushing. A syntax error surfaces there as "workflow file issue".

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/sync-content.yml
git commit -m "ci: sync published Notion posts every 10 minutes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: One-time migration of the existing posts

**Files:**
- Create: `scripts/mdx-to-notion.ts`
- Modify: `package.json` (add the `migrate:to-notion` script)

**Interfaces:**
- Consumes: `createNotionClient` (Task 8).
- Produces: `pnpm migrate:to-notion` — run once, manually, never wired into CI.

**Scope:** the two existing posts use only paragraphs, `##` headings, a bulleted list, and fenced code. The converter handles exactly that set and errors on anything else rather than silently dropping it.

- [ ] **Step 1: Write the migration script**

```ts
// scripts/mdx-to-notion.ts
//
// ONE-TIME migration: pushes the hand-written content/blog/*.mdx posts into the
// Notion database so they don't need retyping. Run manually, once. Never wired
// into CI — after migration Notion owns content/blog/ and this script is dead
// weight kept only for the record.
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { createNotionClient } from "../src/lib/notion/client";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

type NotionBlockInput = Record<string, unknown>;

const text = (content: string) => [{ type: "text", text: { content } }];

// Handles exactly the constructs the two existing posts use. Anything else
// throws rather than silently dropping content.
function markdownToBlocks(markdown: string): NotionBlockInput[] {
  const blocks: NotionBlockInput[] = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") continue;

    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || "plain text";
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      blocks.push({
        object: "block",
        type: "code",
        code: { rich_text: text(body.join("\n")), language },
      });
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: text(line.slice(4)) },
      });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_1", // shifts back: `##` on disk was Notion H1
        heading_1: { rich_text: text(line.slice(3)) },
      });
      continue;
    }
    if (line.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: text(line.slice(2)) },
      });
      continue;
    }
    if (/^[#>|]/.test(line)) {
      throw new Error(`unsupported markdown in migration: ${JSON.stringify(line)}`);
    }

    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: text(line) },
    });
  }

  return blocks;
}

async function main(): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;
  if (!token || !dataSourceId) {
    throw new Error("set NOTION_TOKEN and NOTION_DATA_SOURCE_ID");
  }

  const client = createNotionClient(token);
  const names = (await fs.readdir(BLOG_DIR)).filter((n) => n.endsWith(".mdx"));

  for (const name of names) {
    const slug = name.replace(/\.mdx$/, "");
    const raw = await fs.readFile(path.join(BLOG_DIR, name), "utf8");
    const { data, content } = matter(raw);

    await client.request({
      path: "pages",
      method: "post",
      body: {
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: {
          Title: { title: text(String(data.title ?? slug)) },
          Slug: { rich_text: text(slug) },
          Excerpt: { rich_text: text(String(data.excerpt ?? "")) },
          Tags: {
            multi_select: (Array.isArray(data.tags) ? data.tags : []).map(
              (tag: string) => ({ name: String(tag) }),
            ),
          },
          Status: { status: { name: "Published" } },
          Published: { date: { start: String(data.date) } },
        },
        children: markdownToBlocks(content),
      },
    });

    console.log(`✓ migrated ${slug}`);
  }
}

main().catch((error: unknown) => {
  console.error(`✗ migration failed: ${(error as Error).message}`);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package script**

In `package.json`, add to `"scripts"`:

```json
"migrate:to-notion": "tsx scripts/mdx-to-notion.ts"
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/mdx-to-notion.ts package.json
git commit -m "chore(notion): add one-time MDX-to-Notion migration script

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Authoring guide and README

**Files:**
- Create: `docs/authoring.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the workflow from Tasks 9 and 11.
- Produces: user-facing documentation. No code depends on it.

- [ ] **Step 1: Write `docs/authoring.md`**

```markdown
# Writing and publishing posts

Posts are written in Notion and published automatically. You never touch git.

## Publishing

1. Add a row to the **Blog** database in Notion.
2. Write the post in the page body.
3. Fill in **Excerpt**, **Published** (date), and **Tags**.
4. Set **Status** → **Published**.

It goes live within ~15 minutes. To publish immediately, open the repo's
**Actions → Sync content from Notion → Run workflow** button; that cuts it to
about 5 minutes (the CI and deploy floor).

## Formatting on your phone

You never type markdown. Use Notion's own formatting — these shortcuts convert
as you type.

| You want | Type | Or |
| --- | --- | --- |
| Section heading | `## ` + space | `/h2` |
| Sub-heading | `### ` + space | `/h3` |
| Bullet list | `- ` + space | `/bullet` |
| Numbered list | `1. ` + space | `/number` |
| **Bold** | `**text**` | select → toolbar |
| *Italic* | `*text*` | select → toolbar |
| `inline code` | `` `text` `` | select → toolbar → code |
| Code block | ` ``` ` | `/code` |
| Quote | `> ` + space | `/quote` |
| Divider | `---` | `/divider` |
| Image | — | `/image`, or paste from the camera roll |
| Link | paste a URL over selected text | select → toolbar → link |

Notion's Heading 1/2/3 render on the site as h2/h3/h4 — the post title is
already the page's h1.

## What it produces

A Notion page with an H1 "A minimal tool", a paragraph, and a TypeScript code
block becomes:

```mdx
---
title: "Grounding agents"
date: "2026-08-03"
excerpt: "Why retrieval beats prompt-stuffing."
tags: ["AI"]
updated: "2026-08-03"
---

## A minimal tool

Here's the shape of a grounded tool call — note the `topK` limit.

```ts
const hits = await index.search(q, { topK: 5 });
```
```

Properties become frontmatter; blocks become the body. Notion's code-block
language becomes the fence language, so syntax highlighting is automatic.

## What to avoid

These have no blog equivalent and are **skipped with a warning** — their
content disappears silently:

- Synced blocks
- Databases embedded in a page
- Buttons
- Column layouts

Sub-pages nested under a post are also skipped, which makes them a safe place
for outlines and research notes.

## Known rough edge

Code blocks are painful to author on a phone — touch keyboards fight braces and
backticks, and setting the language means tapping into a dropdown. Draft prose
on mobile and add code from a laptop. Pasting copied code works fine on mobile.

## Privacy

Three independent gates decide what reaches the site:

1. **The integration connection.** The token can only read pages explicitly
   shared with it. Everything else in the workspace is invisible to it — not
   filtered out, genuinely unreadable.
2. **The database ID.** Only the Blog database is queried.
3. **Status.** Only `Published` rows are fetched.

Extra **properties** on the Blog database (personal notes, edit status) are
never read. **Body content is published in full**, so don't leave private
asides in the post itself.

Note that this repo is public: unpublishing removes a post from the site but
not from git history.

## Local commands

```bash
pnpm sync:notion          # pull published posts now
pnpm sync:notion --check  # exit 1 if a sync would change anything
```

Requires `NOTION_TOKEN` and `NOTION_DATABASE_ID` in your environment.
```

- [ ] **Step 2: Update the README**

In `README.md`, replace the `content/blog/*.mdx` bullet under "Content to personalize" with:

```markdown
- `content/blog/*.mdx` — **generated from Notion; do not hand-edit** (the next
  sync reverts changes). Write posts in the Notion Blog database instead. See
  [`docs/authoring.md`](docs/authoring.md).
```

Then add a new section after "Environment variables":

```markdown
## Blog content sync

Posts are written in Notion and synced into `content/blog/` by
`.github/workflows/sync-content.yml` (every 10 minutes, plus a manual
"Run workflow" button). See [`docs/authoring.md`](docs/authoring.md) for the
authoring workflow.

Required GitHub secrets:

- `NOTION_TOKEN` — the internal integration token.
- `NOTION_DATABASE_ID` — the Blog database id.
- `CONTENT_SYNC_TOKEN` — a fine-grained PAT scoped to this repo with
  `contents: write`. **Required:** pushes made with the default `GITHUB_TOKEN`
  do not trigger other workflows, so the deploy would never run.
```

- [ ] **Step 3: Verify the docs render**

Run: `pnpm exec prettier --check docs/authoring.md README.md || true`
Then read both files and confirm the tables and fenced blocks are intact.

- [ ] **Step 4: Commit**

```bash
git add docs/authoring.md README.md
git commit -m "docs: add the Notion authoring guide

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: End-to-end verification against the real workspace

> ## ⛔ STOP — HUMAN REQUIRED
>
> **An autonomous agent must NOT attempt this task.** Stop after Task 13, report
> what was completed, and leave this task unchecked.
>
> Every step below needs credentials and a Notion workspace that only the repo
> owner can create: an internal integration token, a database shared with it,
> and three GitHub Actions secrets. There is no way to satisfy them from a
> sandbox.
>
> **Specifically forbidden:**
> - Do not invent, mock, or stub Notion credentials to make steps "pass".
> - Do not mark any step here complete without having actually run it.
> - Do not weaken or delete the idempotency test (Task 7) because this task
>   could not run — that test is the safety net for the 10-minute cron.
> - Do not report Plan A as "complete". Report it as **"Tasks 1–13 complete,
>   Task 14 blocked on credentials"**.
>
> Tasks 1–13 produce a fully type-checked, fully unit-tested pipeline. That is
> the correct stopping point for unattended work.

**Files:** none — this is a manual verification gate.

**Interfaces:**
- Consumes: everything from Tasks 1–13.
- Produces: a verified, working publish flow.

**Do not skip when a human is available.** Every prior task was tested against fixtures. This is the first contact with real Notion data, and it is where schema mismatches surface — most likely the property names in `fetch-post.ts`, which are matched literally.

- [ ] **Step 1: Create the Notion database**

Create a database named **Blog** with exactly these properties (names are matched literally by `fetch-post.ts`):

| Property | Type |
| --- | --- |
| `Title` | Title |
| `Slug` | Rich text |
| `Excerpt` | Rich text |
| `Tags` | Multi-select |
| `Status` | Status, with a `Published` option |
| `Published` | Date |

- [ ] **Step 2: Create the integration and connect it**

At notion.so/profile/integrations create an internal integration, copy its token, then in the Blog database use **⋯ → Connections → Add connection** to share only that database with it.

- [ ] **Step 3: Run the migration**

```bash
NOTION_TOKEN=<token> NOTION_DATA_SOURCE_ID=<data source id> pnpm migrate:to-notion
```

Expected: `✓ migrated grounding-agents-with-mcp` and `✓ migrated observability-engineers-read`. Confirm both appear in Notion with their body content intact.

- [ ] **Step 4: Run the sync and confirm it is a no-op**

```bash
NOTION_TOKEN=<token> NOTION_DATABASE_ID=<db id> pnpm sync:notion
```

Expected: `✓ 2 unchanged, 0 written, 0 removed` — or a small diff limited to `updated`, since the migrated pages are newly created. If the body changed, the round-trip is lossy; fix the converter before continuing.

- [ ] **Step 5: Prove idempotency against live data**

Run the same command twice more.
Expected: `✓ 2 unchanged, 0 written, 0 removed` both times, and `git status` clean. **If a second run produces a diff, stop** — the 10-minute cron would commit 144 times a day. Find the unstable field and fix it in the pure modules.

- [ ] **Step 6: Publish a real post from your phone**

Write a short post in the Notion app including a heading, a bullet list, a bold word, an inline code span, and an image from the camera roll. Set Status → Published.

Then run `pnpm sync:notion` locally and confirm: the `.mdx` appears, the image is under `public/images/blog/<slug>/` with a hashed name, and `pnpm run build` succeeds.

- [ ] **Step 7: Add the GitHub secrets and trigger the workflow**

Add `NOTION_TOKEN`, `NOTION_DATABASE_ID`, and `CONTENT_SYNC_TOKEN` under Settings → Secrets and variables → Actions. Then run **Actions → Sync content from Notion → Run workflow**.

Expected: the sync job succeeds, and if there were changes, a `content: sync from Notion` commit lands on `main` **and** `deploy.yml` starts. If deploy does not start, `CONTENT_SYNC_TOKEN` is wrong or missing — that is the failure mode called out in Task 11.

- [ ] **Step 8: Confirm the post is live**

Visit `https://elopenmike.com/blog` and confirm the new post renders with working images, highlighted code, and correct heading levels.

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix(notion): corrections from end-to-end verification

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §3 database schema | 14 (step 1), consumed by 8 |
| §3.1 workspace isolation | 13 (authoring guide), 14 (step 2) |
| §4 API specifics | 8 |
| §5 converter modules | 1, 2, 3 |
| §5.3 MDX escaping | 2 |
| §5.4 slugs | 1 |
| §6 image capture | 6, 9 |
| §7 idempotency | 4, 6, 7, 14 (step 5) |
| §8 validation | 5 |
| §9.6 h4 style | 10 |
| §10.1 sync script | 9 |
| §10.2 workflow + PAT | 11 |
| §11 migration | 12 |
| §13 testing | 1–7 |
| §16 authoring guide | 13 |

No gaps.

**Placeholder scan:** every step contains runnable commands or complete code. No "TBD", no "add error handling", no "similar to Task N".

**Type consistency:** `MdBlock`, `PostSource`, `PostFrontmatter`, `RichText` are defined in Task 1 and used unchanged in Tasks 2, 3, 8, 9. `ConvertContext` is defined in Task 3 and consumed in Tasks 7 and 9. `ValidatablePost` is defined in Task 5 and consumed in Task 9. `planReconcile` returns `{write, delete, unchanged}` in Task 6, matching its use in Tasks 7 and 9. `imageFileName`/`imageDir` signatures match between Tasks 6 and 9.

**Known deviation:** Task 3's `ConvertContext` gains an optional `onWarning` callback beyond the spec's §5 module list. It is needed so the sync can report skipped blocks with the post's slug attached; the spec's §5.1 "skipped, logged as a warning" requires a channel for that.

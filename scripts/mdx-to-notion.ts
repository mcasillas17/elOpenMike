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
      throw new Error(
        `unsupported markdown in migration: ${JSON.stringify(line)}`,
      );
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

  // Notion names the title property "Name" by default. Look it up by type so
  // the migration writes to whatever the database actually calls it — matching
  // how fetch-post.ts reads it back.
  const dataSource = await client.request<{
    properties: Record<string, { type: string }>;
  }>({
    path: `data_sources/${dataSourceId}`,
    method: "get",
  });
  const titleProp =
    Object.entries(dataSource.properties).find(
      ([, property]) => property.type === "title",
    )?.[0] ?? "Name";

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
          [titleProp]: { title: text(String(data.title ?? slug)) },
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

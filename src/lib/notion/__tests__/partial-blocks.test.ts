import { describe, expect, it } from "vitest";
import type { Client } from "@notionhq/client";
import { fetchBlockTree } from "@/lib/notion/client";
import { isPartialBlockError } from "@/lib/notion/block-shape";
import { collectSources } from "@/lib/notion/collect";
import { renderPosts, planSync } from "@/lib/notion/sync";
import { postPath } from "@/lib/notion/plan";
import type { PageObject } from "@/lib/notion/client";
import type { MdBlock } from "@/lib/notion/types";

// Notion answers a children list with a mix of *full* block objects and
// *partial* ones — `{ object: "block", id }` and nothing else. The walk cast
// the whole array to the tree shape, so a partial block arrived carrying no
// type and no payload at all.
//
// Nothing downstream could tell: the converter reads `block.type`, finds
// undefined, falls through to its default arm, warns "skipped unsupported
// block" and renders the empty string. So a post whose middle paragraph came
// back partial published as a post missing its middle paragraph — silently,
// under the same slug, over the file that still had it.
//
// A partial block is not content this run may publish and not a block it may
// drop. It fails the post it belongs to, which puts that post into the same
// preserve-or-skip handling as an image that would not download: the file on
// disk is kept exactly as it is, and `--check` fails.

const full = (id: string, has_children = false) => ({
  object: "block",
  id,
  type: "paragraph",
  has_children,
  paragraph: { rich_text: [{ type: "text", plain_text: id }] },
});

// What the SDK calls a PartialBlockObjectResponse: an object and an id.
const partial = (id: string) => ({ object: "block", id });

type ChildrenResponse = {
  results: Array<Record<string, unknown>>;
  has_more: boolean;
  next_cursor: string | null;
};

function childrenClient(scripts: Record<string, ChildrenResponse[]>): Client {
  return {
    blocks: {
      children: {
        list: async ({ block_id }: { block_id: string }) => {
          const next = scripts[block_id]?.shift();
          if (!next) throw new Error(`no response prepared for ${block_id}`);
          return next;
        },
      },
    },
  } as unknown as Client;
}

const page = (results: Array<Record<string, unknown>>): ChildrenResponse => ({
  results,
  has_more: false,
  next_cursor: null,
});

describe("a children list carrying a block Notion did not fill in", () => {
  it("refuses a partial block on the first page", async () => {
    const client = childrenClient({ "page-1": [page([partial("b1")])] });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(
      /partial|incomplete/i,
    );
  });

  it("refuses a partial block on a later page, after a whole one arrived", async () => {
    const client = childrenClient({
      "page-1": [
        { results: [full("b1")], has_more: true, next_cursor: "c1" },
        page([partial("b2")]),
      ],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(
      /partial|incomplete/i,
    );
  });

  it("refuses a partial block nested under a full one", async () => {
    const client = childrenClient({
      "page-1": [page([full("b1", true)])],
      b1: [page([partial("b1-1")])],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(
      /partial|incomplete/i,
    );
  });

  it("refuses the whole tree rather than the blocks it could read", async () => {
    const client = childrenClient({
      "page-1": [page([full("b1"), partial("b2"), full("b3")])],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(
      /partial|incomplete/i,
    );
  });

  it("refuses a block whose type carries no payload the converter could read", async () => {
    const client = childrenClient({
      "page-1": [
        page([{ object: "block", id: "b1", type: "paragraph", has_children: false }]),
      ],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(
      /partial|incomplete/i,
    );
  });

  it("refuses a result that is not a block at all", async () => {
    const client = childrenClient({
      "page-1": [page([{ object: "page", id: "b1" }])],
    });

    const error = await fetchBlockTree(client, "page-1").catch(
      (thrown: unknown) => thrown as Error,
    );

    expect(error.message).toMatch(/not a block/i);
    expect(isPartialBlockError(error)).toBe(true);
  });

  it("names the block and its parent, and repeats nothing they hold", async () => {
    const client = childrenClient({
      "page-1": [page([full("b1", true)])],
      b1: [
        page([
          {
            object: "block",
            id: "b1-1",
            type: "paragraph",
            paragraph: undefined,
          },
        ]),
      ],
    });

    const error = await fetchBlockTree(client, "page-1").catch(
      (thrown: unknown) => thrown as Error,
    );

    expect(error.message).toContain("b1-1");
    expect(error.message).toContain("b1");
    expect(error.message).not.toMatch(/rich_text|plain_text/);
  });

  it("is recognizable as a partial-block failure and nothing else", async () => {
    const client = childrenClient({ "page-1": [page([partial("b1")])] });

    const error = await fetchBlockTree(client, "page-1").catch(
      (thrown: unknown) => thrown,
    );

    expect(isPartialBlockError(error)).toBe(true);
    expect(isPartialBlockError(new Error("something else"))).toBe(false);
  });

  it("still walks a tree Notion filled in, nesting and all", async () => {
    const client = childrenClient({
      "page-1": [page([full("b1", true), full("b2")])],
      b1: [page([full("b1-1")])],
    });

    const tree = await fetchBlockTree(client, "page-1");

    expect(tree.map((block) => block.id)).toEqual(["b1", "b2"]);
    expect(tree[0].children.map((block) => block.id)).toEqual(["b1-1"]);
    expect(tree[0].type).toBe("paragraph");
  });

  // Notion's own answer for a block type this API version does not model is a
  // full block of type "unsupported". It is complete, so it is read — and the
  // converter's warning is what says so.
  it("accepts an `unsupported` block, which is a block Notion did fill in", async () => {
    const client = childrenClient({
      "page-1": [
        page([
          {
            object: "block",
            id: "b1",
            type: "unsupported",
            has_children: false,
            unsupported: {},
          },
        ]),
      ],
    });

    const tree = await fetchBlockTree(client, "page-1");
    expect(tree.map((block) => block.type)).toEqual(["unsupported"]);
  });
});

// ---------------------------------------------------------------------------
// One post's bad block is one post's problem.
// ---------------------------------------------------------------------------

const richText = (value: string) => ({
  type: "rich_text",
  rich_text: [{ plain_text: value }],
});

function pageObject(slug: string): PageObject {
  return {
    id: `page-${slug}`,
    last_edited_time: "2026-06-01T12:00:00.000Z",
    properties: {
      Name: { type: "title", title: [{ plain_text: `Title ${slug}` }] },
      Slug: richText(slug),
      Excerpt: richText(`Excerpt ${slug}`),
      Tags: { type: "multi_select", multi_select: [{ name: "AI" }] },
      Published: { type: "date", date: { start: "2026-05-20" } },
      Status: { type: "status", status: { name: "Published" } },
    },
  };
}

describe("a post whose blocks came back partial", () => {
  const deps = (client: Client) => ({
    fetchBlocks: (pageId: string) => fetchBlockTree(client, pageId),
    retrievePage: async (pageId: string) => pageObject(pageId.slice(5)),
  });

  it("fails that post and collects the others", async () => {
    const client = childrenClient({
      "page-a": [page([full("a1")])],
      "page-b": [page([full("b1"), partial("b2")])],
      "page-c": [page([full("c1")])],
    });

    const outcome = await collectSources(
      [pageObject("a"), pageObject("b"), pageObject("c")],
      deps(client),
    );

    expect(outcome.sources.map((source) => source.slug)).toEqual(["a", "c"]);
    expect(outcome.failures.map((failure) => failure.slug)).toEqual(["b"]);
    expect(outcome.failures[0].pageId).toBe("page-b");
    expect(outcome.failures[0].message).toMatch(/partial|incomplete/i);
  });

  it("fails the post when the partial block is nested inside it", async () => {
    const client = childrenClient({
      "page-a": [page([full("a1", true)])],
      a1: [page([partial("a1-1")])],
    });

    const outcome = await collectSources([pageObject("a")], deps(client));

    expect(outcome.sources).toEqual([]);
    expect(outcome.failures.map((failure) => failure.pageId)).toEqual(["page-a"]);
  });

  // The contract the run has always had: a block fetch that fails for any other
  // reason is an integration or API problem, not one post's problem, and it
  // still takes the run down rather than quietly publishing a shorter blog.
  it("still rejects the whole run on any other block-fetch failure", async () => {
    const outcome = collectSources([pageObject("a")], {
      fetchBlocks: async () => {
        throw new Error("Notion is unreachable");
      },
      retrievePage: async () => pageObject("a"),
    });

    await expect(outcome).rejects.toThrow("Notion is unreachable");
  });

  it("keeps the file already on disk rather than deleting it", async () => {
    const client = childrenClient({
      "page-a": [page([full("a1")])],
      "page-b": [page([partial("b1")])],
    });

    const collected = await collectSources(
      [pageObject("a"), pageObject("b")],
      deps(client),
    );
    const rendered = await renderPosts(
      collected.sources,
      async () => {
        throw new Error("no images in this post");
      },
      collected.failures,
    );

    const onDisk = new Map([
      [postPath("a"), "old a"],
      [postPath("b"), "the paragraph that came back partial"],
    ]);
    const plan = planSync(rendered, onDisk);

    expect(plan.plan.delete).toEqual([]);
    expect(plan.preserved).toEqual(["b"]);
    expect(plan.desired.get(postPath("b"))).toBe(
      "the paragraph that came back partial",
    );
  });

  // The shape that made this dangerous: rendering the tree anyway published a
  // post with the partial block's content missing.
  it("never hands the converter a tree with a hole in it", async () => {
    const client = childrenClient({
      "page-a": [page([full("a1"), partial("a2"), full("a3")])],
    });

    const collected = await collectSources([pageObject("a")], deps(client));
    const blocks: MdBlock[] = collected.sources.flatMap(
      (source) => source.blocks,
    );

    expect(blocks).toEqual([]);
    expect(collected.failures).toHaveLength(1);
  });
});

import { describe, it, expect, vi } from "vitest";
import { collectSources, revalidatePage } from "@/lib/notion/collect";
import { renderPosts, planSync } from "@/lib/notion/sync";
import { serializePost } from "@/lib/notion/serialize";
import { postPath } from "@/lib/notion/plan";
import { MAX_CONCURRENT_REQUESTS } from "@/lib/notion/pool";
import { MAX_RETRY_WAIT_MS } from "@/lib/notion/retry";
import { retrievePage, type PageObject } from "@/lib/notion/client";
import type { Client } from "@notionhq/client";
import type { MdBlock } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

const richText = (value: string) => ({
  type: "rich_text",
  rich_text: [{ plain_text: value }],
});

const title = (value: string) => ({
  type: "title",
  title: [{ plain_text: value }],
});

function page(
  slug: string,
  {
    status = "Published",
    lastEdited = "2026-06-01T12:00:00.000Z",
    archived,
    in_trash,
  }: {
    status?: string | null;
    lastEdited?: string;
    archived?: boolean;
    in_trash?: boolean;
  } = {},
): PageObject {
  return {
    id: `page-${slug}`,
    last_edited_time: lastEdited,
    archived,
    in_trash,
    properties: {
      Name: title(`Title ${slug}`),
      Slug: richText(slug),
      Excerpt: richText(`Excerpt ${slug}`),
      Tags: { type: "multi_select", multi_select: [{ name: "AI" }] },
      Published: { type: "date", date: { start: "2026-05-20" } },
      Status: { type: "status", status: status === null ? null : { name: status } },
    },
  };
}

const body = (slug: string): MdBlock[] => [
  block("paragraph", { rich_text: [rt(`Body of ${slug}.`)] }),
];

// A stand-in Notion client: block trees resolve from a table, and each page's
// metadata can be swapped out to simulate an edit landing mid-run.
function api(initial: PageObject[]) {
  const current = new Map(initial.map((p) => [p.id, p]));
  const calls: string[] = [];
  const state = { active: 0, maxActive: 0 };

  return {
    calls,
    state,
    current,
    fetchBlocks: async (pageId: string): Promise<MdBlock[]> => {
      calls.push(`blocks:${pageId}`);
      state.active += 1;
      state.maxActive = Math.max(state.maxActive, state.active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      state.active -= 1;
      return body(pageId);
    },
    retrievePage: async (pageId: string): Promise<PageObject> => {
      calls.push(`retrieve:${pageId}`);
      const found = current.get(pageId);
      if (!found) throw new Error(`page ${pageId} not found`);
      return found;
    },
  };
}

describe("revalidatePage", () => {
  it("accepts a page whose status and version are untouched", () => {
    const before = page("a");
    expect(revalidatePage(before, page("a"))).toEqual({ ok: true });
  });

  it("rejects a page that stopped being Published", () => {
    const result = revalidatePage(page("a"), page("a", { status: "Draft" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("Published");
  });

  it("rejects a page whose Status was cleared entirely", () => {
    const result = revalidatePage(page("a"), page("a", { status: null }));
    expect(result.ok).toBe(false);
  });

  it("rejects a page edited while its blocks were loading", () => {
    const result = revalidatePage(
      page("a", { lastEdited: "2026-06-01T12:00:00.000Z" }),
      page("a", { lastEdited: "2026-06-01T12:00:09.000Z" }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain(
      "2026-06-01T12:00:09.000Z",
    );
  });

  it("rejects a page moved to the trash mid-run under either flag", () => {
    expect(revalidatePage(page("a"), page("a", { archived: true })).ok).toBe(
      false,
    );
    expect(revalidatePage(page("a"), page("a", { in_trash: true })).ok).toBe(
      false,
    );
  });
});

describe("collectSources", () => {
  it("revalidates each page only after its blocks have been fetched", async () => {
    const client = api([page("a")]);
    await collectSources([page("a")], client);
    expect(client.calls).toEqual(["blocks:page-a", "retrieve:page-a"]);
  });

  it("accepts an unchanged page and carries its blocks through", async () => {
    const client = api([page("a")]);
    const outcome = await collectSources([page("a")], client);

    expect(outcome.failures).toEqual([]);
    expect(outcome.sources.map((s) => s.slug)).toEqual(["a"]);
    expect(outcome.sources[0].blocks).toEqual(body("page-a"));
  });

  it("drops a page flipped to Draft while its blocks were fetched", async () => {
    const snapshot = page("a");
    const client = api([snapshot]);
    client.current.set(snapshot.id, page("a", { status: "Draft" }));

    const outcome = await collectSources([snapshot], client);
    expect(outcome.sources).toEqual([]);
    expect(outcome.failures).toEqual([
      {
        slug: "a",
        pageId: "page-a",
        message: expect.stringContaining("Published"),
      },
    ]);
  });

  it("drops a page whose last_edited_time moved while its blocks were fetched", async () => {
    const snapshot = page("a", { lastEdited: "2026-06-01T12:00:00.000Z" });
    const client = api([snapshot]);
    client.current.set(
      snapshot.id,
      page("a", { lastEdited: "2026-06-01T12:30:00.000Z" }),
    );

    const outcome = await collectSources([snapshot], client);
    expect(outcome.sources).toEqual([]);
    expect(outcome.failures[0].message).toContain("edited");
  });

  it("treats an unconfirmable page as a failure rather than aborting the run", async () => {
    const pages = [page("a"), page("b")];
    const client = api(pages);
    client.current.delete("page-a");

    const outcome = await collectSources(pages, client);
    expect(outcome.sources.map((s) => s.slug)).toEqual(["b"]);
    expect(outcome.failures.map((f) => f.slug)).toEqual(["a"]);
    expect(outcome.failures[0].message).toContain("page page-a not found");
  });

  it("isolates one stale page from the rest of the run and keeps page order", async () => {
    const pages = [page("a"), page("b"), page("c")];
    const client = api(pages);
    client.current.set("page-b", page("b", { status: "Draft" }));

    const outcome = await collectSources(pages, client);
    expect(outcome.sources.map((s) => s.slug)).toEqual(["a", "c"]);
    expect(outcome.failures.map((f) => f.slug)).toEqual(["b"]);
  });

  it("stays inside the request budget the sync is bounded to", async () => {
    const pages = Array.from({ length: 12 }, (_, i) => page(`p${i}`));
    const client = api(pages);
    await collectSources(pages, client);
    expect(client.state.maxActive).toBe(MAX_CONCURRENT_REQUESTS);
  });
});

// A stale page must land in exactly the same bucket as an image failure: the
// file already on disk is left alone, and a page that never synced publishes
// nothing at all.

// The revalidation read is a real API call on the sync's hot path, so it has to
// survive a rate limit exactly like every other one.
describe("retrievePage", () => {
  const rateLimited = () =>
    Object.assign(new Error("rate limited"), {
      status: 429,
      headers: new Headers({ "retry-after": "0" }),
    });

  it("retries a 429 and returns the page once it lands", async () => {
    let attempts = 0;
    const client = {
      pages: {
        retrieve: async () => {
          attempts += 1;
          if (attempts < 3) throw rateLimited();
          return {
            id: "page-a",
            last_edited_time: "2026-06-01T12:00:00.000Z",
            in_trash: false,
            properties: { Status: { status: { name: "Published" } } },
          };
        },
      },
    } as unknown as Client;

    vi.useFakeTimers();
    try {
      const pending = retrievePage(client, "page-a");
      await vi.advanceTimersByTimeAsync(MAX_RETRY_WAIT_MS);
      const page = await pending;
      expect(attempts).toBe(3);
      expect(page.last_edited_time).toBe("2026-06-01T12:00:00.000Z");
      expect(page.in_trash).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a partial page object rather than treating it as unchanged", async () => {
    const client = {
      pages: { retrieve: async () => ({ id: "page-a", object: "page" }) },
    } as unknown as Client;

    await expect(retrievePage(client, "page-a")).rejects.toThrow(
      "returned no properties",
    );
  });
});

describe("a stale page through the rest of the sync", () => {
  const rendered = (slug: string) =>
    serializePost(
      {
        title: `Title ${slug}`,
        date: "2026-05-20",
        excerpt: `Excerpt ${slug}`,
        tags: ["AI"],
        updated: "2026-06-01",
      },
      `Body of page-${slug}.\n`,
    );

  it("preserves the existing file for a stale page and skips an unseen one", async () => {
    const pages = [page("a"), page("b"), page("c")];
    const client = api(pages);
    client.current.set("page-a", page("a", { status: "Draft" }));
    client.current.set("page-b", page("b", { status: "Draft" }));

    const collected = await collectSources(pages, client);
    const outcome = await renderPosts(
      collected.sources,
      async () => ({ bytes: new Uint8Array(), contentType: "image/png" }),
      collected.failures,
    );

    const existing = new Map([[postPath("a"), rendered("a")]]);
    const plan = planSync(outcome, existing);

    expect(plan.preserved).toEqual(["a"]);
    expect(plan.skipped).toEqual(["b"]);
    expect(plan.desired.get(postPath("a"))).toBe(rendered("a"));
    expect(plan.desired.has(postPath("b"))).toBe(false);
    expect(plan.plan.delete).toEqual([]);
  });
});

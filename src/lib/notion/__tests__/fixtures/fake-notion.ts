import type { Client, BlockObjectRequest } from "@notionhq/client";
import { MAX_CHILDREN_PER_REQUEST } from "@/lib/notion/limits";
import type { CreatePageRequest } from "@/lib/notion/migrate";

// ---------------------------------------------------------------------------
// A Notion that can be killed, edited underneath a run, and read back.
//
// It stores pages and blocks in the shapes the API answers with — annotations
// spelled out in full, plain_text beside the text, children paginated at 100,
// a last_edited_time that moves on every write — so what a run reads back is
// what Notion would have given it rather than an echo of its own request.
//
// It is a `Client`, not an executor: every test drives the same production
// wiring the migration script does (createMigrationExecutor, fetchBlockTree,
// retrievePage, queryPages), so nothing here can pass while the script fails.
//
//   * `killAfter(n)` ends the process after the nth write: the write lands and
//     every call after it fails, exactly as it would if the process were gone.
//   * `afterRead` and `beforeWrite` are the time-of-check/time-of-use window:
//     a test mutates the database between a validation and the write it was
//     validating, which is the whole race the protocol has to survive.
// ---------------------------------------------------------------------------

export type StoredBlock = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  children: StoredBlock[];
};

export type StoredPage = {
  id: string;
  properties: Record<string, unknown>;
  blocks: StoredBlock[];
  in_trash: boolean;
  last_edited_time: string;
};

export class ProcessKilled extends Error {
  constructor() {
    super("the process was killed");
  }
}

export function storedRuns(runs: unknown): unknown {
  return (runs as Array<Record<string, unknown>>).map((item) => {
    const text = item.text as { content: string; link?: { url: string } | null };
    const annotations = (item.annotations ?? {}) as Record<string, boolean>;
    return {
      type: "text",
      text: { content: text.content, link: text.link ?? null },
      annotations: {
        bold: annotations.bold === true,
        italic: annotations.italic === true,
        strikethrough: annotations.strikethrough === true,
        underline: annotations.underline === true,
        code: annotations.code === true,
        color: "default",
      },
      plain_text: text.content,
      href: text.link?.url ?? null,
    };
  });
}

let storedIds = 0;

// A property value as Notion stores and re-serves it: named by its own type,
// with plain_text beside every run. A request carries neither.
export function storedProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties).map(([name, value]) => {
      const [type, payload] = Object.entries(
        value as Record<string, unknown>,
      )[0];
      if (type === "title" || type === "rich_text") {
        return [name, { type, [type]: storedRuns(payload) }];
      }
      return [name, { type, [type]: payload }];
    }),
  );
}

// One request block as Notion stores and re-serves it, defaults and all.
export function store(block: BlockObjectRequest): StoredBlock {
  const record = block as unknown as Record<string, unknown>;
  const type = String(record.type);
  const body = { ...(record[type] as Record<string, unknown>) };
  const children = (body.children as BlockObjectRequest[] | undefined) ?? [];
  delete body.children;

  if (Array.isArray(body.rich_text)) body.rich_text = storedRuns(body.rich_text);
  if (Array.isArray(body.cells)) {
    body.cells = (body.cells as unknown[]).map(storedRuns);
  }

  // The fields Notion fills in that no migration request carries.
  if (type === "code") body.caption = body.caption ?? [];
  else if (type === "table") body.has_row_header = body.has_row_header ?? false;
  else if (type !== "table_row" && type !== "divider") {
    body.color = body.color ?? "default";
    if (type.startsWith("heading_")) body.is_toggleable = false;
  }

  storedIds += 1;
  return {
    id: `block-${storedIds}`,
    type,
    payload: body,
    children: children.map(store),
  };
}

export type SeedPage = {
  slug: string;
  title: string;
  status: string;
  blocks?: BlockObjectRequest[];
  in_trash?: boolean;
  excerpt?: string;
  tags?: string[];
  date?: string;
  // Written as a Select rather than a Status property, which is the other
  // shape a database can carry — and the wrong one to write into.
  statusType?: "status" | "select";
};

export function properties({
  slug,
  title,
  status,
  excerpt = `Excerpt ${slug}`,
  tags = ["AI"],
  date = "2026-05-20",
  statusType = "status",
}: SeedPage): Record<string, unknown> {
  return {
    Name: { type: "title", title: [{ plain_text: title }] },
    Slug: { type: "rich_text", rich_text: [{ plain_text: slug }] },
    Excerpt: { type: "rich_text", rich_text: [{ plain_text: excerpt }] },
    Tags: { type: "multi_select", multi_select: tags.map((name) => ({ name })) },
    Published: { type: "date", date: { start: date } },
    Status:
      status === ""
        ? { type: statusType, [statusType]: null }
        : { type: statusType, [statusType]: { name: status } },
  };
}

export type ReadKind = "retrieve" | "children" | "query";
export type WriteKind = "create" | "append" | "update";

export class FakeNotion {
  readonly pages = new Map<string, StoredPage>();
  readonly mutations: string[] = [];
  // How many blocks a page held each time it was promoted to Published.
  readonly published: Array<{ pageId: string; blocks: number }> = [];
  childPageReads = 0;
  // Called after a read has been answered, and before a write lands: the two
  // halves of the window between a check and the use it justified.
  afterRead?: (kind: ReadKind, id: string) => void;
  beforeWrite?: (kind: WriteKind, id: string) => void;
  private dead = false;
  private killAt: number | undefined;
  private nextPage = 0;
  private clock = 0;

  killAfter(mutations: number): void {
    this.killAt = mutations;
  }

  // A new process against the same database: state survives, the run does not.
  restart(): void {
    this.dead = false;
    this.killAt = undefined;
  }

  private alive(): void {
    if (this.dead) throw new ProcessKilled();
  }

  private stamp(pageId: string): void {
    this.clock += 1;
    const page = this.pages.get(pageId);
    if (page) {
      page.last_edited_time = `2026-05-20T00:00:${String(this.clock).padStart(2, "0")}.000Z`;
    }
  }

  private wrote(mutation: string): void {
    this.mutations.push(mutation);
    if (this.killAt !== undefined && this.mutations.length >= this.killAt) {
      this.dead = true;
      throw new ProcessKilled();
    }
  }

  private read(kind: ReadKind, id: string): void {
    this.afterRead?.(kind, id);
  }

  seed(page: SeedPage): string {
    this.nextPage += 1;
    const id = `seeded-${this.nextPage}`;
    this.pages.set(id, {
      id,
      properties: properties(page),
      blocks: (page.blocks ?? []).map(store),
      in_trash: page.in_trash === true,
      last_edited_time: "2026-05-20T00:00:00.000Z",
    });
    return id;
  }

  // --- what a test does to the database while a run is looking away ---------

  edit(pageId: string, change: (page: StoredPage) => void): void {
    const page = this.pages.get(pageId);
    if (!page) throw new Error(`no such page ${pageId}`);
    change(page);
    this.stamp(pageId);
  }

  setStatus(pageId: string, status: string): void {
    this.edit(pageId, (page) => {
      const current = page.properties.Status as { type: string };
      const type = current?.type ?? "status";
      page.properties = {
        ...page.properties,
        Status: { type, [type]: status === "" ? null : { name: status } },
      };
    });
  }

  setProperty(pageId: string, name: string, value: unknown): void {
    this.edit(pageId, (page) => {
      page.properties = { ...page.properties, [name]: value };
    });
  }

  addBlock(pageId: string, text: string): void {
    this.edit(pageId, (page) => {
      page.blocks.push(
        store({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: text } }] },
        } as BlockObjectRequest),
      );
    });
  }

  removeLastBlock(pageId: string): void {
    this.edit(pageId, (page) => {
      page.blocks.pop();
    });
  }

  trash(pageId: string): void {
    this.edit(pageId, (page) => {
      page.in_trash = true;
    });
  }

  // --- the endpoints the migration actually calls ---------------------------

  private createPage(body: CreatePageRequest): { id: string } {
    this.alive();
    this.beforeWrite?.("create", "");
    if (body.children.length > MAX_CHILDREN_PER_REQUEST) {
      throw new Error("Notion takes at most 100 children in one request");
    }
    this.nextPage += 1;
    const id = `page-${this.nextPage}`;
    this.pages.set(id, {
      id,
      properties: storedProperties(body.properties),
      blocks: body.children.map(store),
      in_trash: false,
      last_edited_time: "2026-05-20T00:00:00.000Z",
    });
    this.stamp(id);
    this.wrote(`create:${id}:${body.children.length}`);
    return { id };
  }

  private appendChildren(pageId: string, children: BlockObjectRequest[]): void {
    this.alive();
    this.beforeWrite?.("append", pageId);
    if (children.length > MAX_CHILDREN_PER_REQUEST) {
      throw new Error("Notion takes at most 100 children in one request");
    }
    const page = this.pages.get(pageId);
    if (!page) throw new Error(`no such page ${pageId}`);
    page.blocks.push(...children.map(store));
    this.stamp(pageId);
    this.wrote(`append:${pageId}:${children.length}`);
  }

  private updatePage(
    pageId: string,
    updated: Record<string, unknown>,
  ): void {
    this.alive();
    this.beforeWrite?.("update", pageId);
    const page = this.pages.get(pageId);
    if (!page) throw new Error(`no such page ${pageId}`);

    page.properties = { ...page.properties, ...storedProperties(updated) };
    this.stamp(pageId);

    const status = updated.Status as
      | Record<string, { name?: string }>
      | undefined;
    const name = status
      ? Object.values(status)[0]?.name
      : undefined;

    if (name === "Published") {
      this.published.push({ pageId, blocks: page.blocks.length });
      this.wrote(`publish:${pageId}`);
    } else if (name !== undefined) {
      this.wrote(`status:${pageId}:${name}`);
    } else {
      this.wrote(`meta:${pageId}:${Object.keys(updated).sort().join("+")}`);
    }
  }

  // Structurally what the migration's reads and writes need from a Client.
  get client(): Client {
    const live = () =>
      [...this.pages.values()].filter((page) => !page.in_trash);

    return {
      request: async ({
        path,
        method,
        body,
      }: {
        path: string;
        method: string;
        body: unknown;
      }) => {
        if (path === "pages" && method === "post") {
          return this.createPage(body as CreatePageRequest);
        }
        throw new Error(`unexpected request ${method} ${path}`);
      },
      pages: {
        retrieve: async ({ page_id }: { page_id: string }) => {
          this.alive();
          const page = this.pages.get(page_id);
          if (!page) throw new Error(`no such page ${page_id}`);
          this.read("retrieve", page_id);
          return {
            object: "page",
            id: page.id,
            last_edited_time: page.last_edited_time,
            in_trash: page.in_trash,
            properties: page.properties,
          };
        },
        update: async ({
          page_id,
          properties: updated,
        }: {
          page_id: string;
          properties: Record<string, unknown>;
        }) => {
          this.updatePage(page_id, updated);
          return { object: "page", id: page_id };
        },
      },
      dataSources: {
        query: async () => {
          this.alive();
          this.read("query", "");
          return {
            results: live().map((page) => ({
              object: "page",
              id: page.id,
              last_edited_time: page.last_edited_time,
              properties: page.properties,
            })),
            has_more: false,
            next_cursor: null,
            request_status: { type: "complete" },
          };
        },
      },
      blocks: {
        children: {
          append: async ({
            block_id,
            children,
          }: {
            block_id: string;
            children: BlockObjectRequest[];
          }) => {
            this.appendChildren(block_id, children);
            return { results: [] };
          },
          list: async ({
            block_id,
            start_cursor,
          }: {
            block_id: string;
            start_cursor?: string;
          }) => {
            this.alive();
            this.childPageReads += 1;
            const blocks = this.childrenOf(block_id);
            const from = start_cursor ? Number(start_cursor) : 0;
            const slice = blocks.slice(from, from + MAX_CHILDREN_PER_REQUEST);
            const next = from + slice.length;
            const answer = {
              results: slice.map((block) => ({
                object: "block",
                id: block.id,
                type: block.type,
                has_children: block.children.length > 0,
                [block.type]: block.payload,
              })),
              has_more: next < blocks.length,
              next_cursor: next < blocks.length ? String(next) : null,
            };
            this.read("children", block_id);
            return answer;
          },
        },
      },
    } as unknown as Client;
  }

  private childrenOf(id: string): StoredBlock[] {
    const page = this.pages.get(id);
    if (page) return page.blocks;

    const find = (blocks: StoredBlock[]): StoredBlock[] | undefined => {
      for (const block of blocks) {
        if (block.id === id) return block.children;
        const nested = find(block.children);
        if (nested) return nested;
      }
      return undefined;
    };
    return find([...this.pages.values()].flatMap((entry) => entry.blocks)) ?? [];
  }
}

// What the database looks like from the outside once the dust settles.
export function livePages(notion: FakeNotion) {
  return [...notion.pages.values()]
    .filter((page) => !page.in_trash)
    .map((page) => ({
      id: page.id,
      slug: (
        (page.properties.Slug as { rich_text: { plain_text: string }[] })
          .rich_text[0] ?? { plain_text: "" }
      ).plain_text,
      status:
        ((page.properties.Status as { status?: { name?: string } }).status ?? {})
          .name ?? "",
      texts: page.blocks.map(
        (block) =>
          (
            (block.payload.rich_text as { plain_text: string }[] | undefined) ??
            []
          )
            .map((run) => run.plain_text)
            .join(""),
      ),
    }));
}

import { describe, expect, it } from "vitest";
import type { Client } from "@notionhq/client";
import { fetchBlockTree, queryPages } from "@/lib/notion/client";

// A pagination cursor is an opaque token Notion issues and this repo hands
// straight back. What is inside one is Notion's business, and the honest
// assumption is the worst one: that it carries state, an identifier, or a
// credential of its own. It is certainly not a value worth printing.
//
// Both guards printed it anyway. A cursor the walk had already followed was
// quoted in full — `handed back the cursor "…" a second time` — and a cursor
// that was not a usable string was JSON.stringify'd into the message, which
// prints an object's contents as readily as a string's. Those messages are what
// `scripts/sync-notion.ts` writes to the console as `✗ sync failed: …`, on a
// scheduled workflow whose log is public.
//
// What a reader actually needs is where the walk stopped and what shape of
// wrongness stopped it: the list, the page number, and the category. None of
// those say anything about the token.

// Cursors that would be a disaster to print. Nothing here is real; each is the
// shape of something that is.
const SECRETS = [
  "ghp_exampleTokenValue0000",
  "https://internal.corp.example/next?sig=SECRET-123",
  "AKIAEXAMPLEKEY",
  "sessionid=abcdef;user=alice@corp.example",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.notarealsignature",
];

// Everything an error could carry a cursor out through: its message, its own
// properties — the SDK keeps the raw response body on one — and whatever a
// logger that stringifies it would print. The stack is in here too: it begins
// with the message, so a message scrubbed without its stack still leaks.
function everythingSaid(error: unknown): string {
  const value = error as Error;
  return [
    value.message,
    String(value),
    value.stack ?? "",
    JSON.stringify(value),
    JSON.stringify({ ...value }),
    JSON.stringify(Object.getOwnPropertyDescriptors(value)),
  ].join("\n");
}

// The same, minus the stack's frames, which name node's own `internal/*`
// modules and would collide with any token that happens to contain a common
// word. Exact tokens are still looked for in the frames as well; only the
// fragment sweep below is narrowed to what the error itself says.
function everythingWritten(error: unknown): string {
  const value = error as Error;
  const own = { ...value } as Record<string, unknown>;
  delete own.stack;
  return [value.message, String(value), JSON.stringify(own)].join("\n");
}

function expectNothingLeaked(error: unknown, cursor: unknown): void {
  const said = everythingSaid(error);
  const written = everythingWritten(error);
  const text =
    typeof cursor === "string" ? cursor : JSON.stringify(cursor) ?? String(cursor);
  for (const secret of SECRETS) expect(said).not.toContain(secret);
  // Not just the secrets: no run of the token itself either.
  for (const run of text.split(/[\s.;=&/?]+/).filter((part) => part.length > 6)) {
    expect(written).not.toContain(run);
  }
}

// What a reader is left with instead: the list, where in it the walk stopped,
// and the category of the problem.
function expectStillUseful(error: unknown, page: number): void {
  const message = (error as Error).message;
  expect(message).toMatch(/cursor/i);
  expect(message).toMatch(new RegExp(`page ${page}\\b`));
  expect(message).toMatch(
    /nothing was read, planned, written or deleted this run/,
  );
}

type Page = Record<string, unknown>;

const page = (id: string): Page => ({
  object: "page",
  id,
  last_edited_time: "2026-01-01T00:00:00.000Z",
  properties: {
    Slug: { type: "rich_text", rich_text: [{ plain_text: id }] },
    Status: { type: "status", status: { name: "Published" } },
  },
});

type QueryResponse = {
  results: Page[];
  has_more: boolean;
  next_cursor: unknown;
};

function queryClient(responses: QueryResponse[]): Client {
  return {
    dataSources: {
      query: async () => {
        const next = responses.shift();
        if (!next) throw new Error("queried more pages than were prepared");
        return next;
      },
    },
  } as unknown as Client;
}

const paragraph = (id: string) => ({
  object: "block",
  id,
  type: "paragraph",
  has_children: false,
  paragraph: { rich_text: [{ type: "text", plain_text: id }] },
});

function childrenClient(responses: Array<{
  results: Array<Record<string, unknown>>;
  has_more: boolean;
  next_cursor: unknown;
}>): Client {
  return {
    blocks: {
      children: {
        list: async () => {
          const next = responses.shift();
          if (!next) throw new Error("listed more pages than were prepared");
          return next;
        },
      },
    },
  } as unknown as Client;
}

async function refusal(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => {
      throw new Error("expected the walk to be refused");
    },
    (error: unknown) => error,
  );
}

describe("a cursor a data source hands back twice", () => {
  it.each(SECRETS)("says which page it looped on, not %s", async (cursor) => {
    const error = await refusal(
      queryPages(
        queryClient([
          { results: [page("a")], has_more: true, next_cursor: cursor },
          { results: [page("b")], has_more: true, next_cursor: cursor },
        ]),
        "ds-1",
      ),
    );

    expectNothingLeaked(error, cursor);
    expectStillUseful(error, 2);
    expect((error as Error).message).toMatch(/already followed|looping/i);
  });

  it("counts the page it stopped on from the start of the walk", async () => {
    const [cursor] = SECRETS;
    const error = await refusal(
      queryPages(
        queryClient([
          { results: [page("a")], has_more: true, next_cursor: "c1" },
          { results: [page("b")], has_more: true, next_cursor: "c2" },
          { results: [page("c")], has_more: true, next_cursor: cursor },
          { results: [page("d")], has_more: true, next_cursor: cursor },
        ]),
        "ds-1",
      ),
    );

    expectNothingLeaked(error, cursor);
    expectStillUseful(error, 4);
  });
});

describe("a cursor that is not a cursor at all", () => {
  const unusable: Array<[string, unknown]> = [
    ["null", null],
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   \n\t"],
    ["an object carrying a token", { token: SECRETS[0] }],
    ["an array carrying a URL", [SECRETS[1]]],
    ["a number", 42],
    ["a credential-bearing object", { session: SECRETS[3] }],
  ];

  it.each(unusable)("refuses %s without repeating it", async (_name, cursor) => {
    const error = await refusal(
      queryPages(
        queryClient([{ results: [page("a")], has_more: true, next_cursor: cursor }]),
        "ds-1",
      ),
    );

    expectNothingLeaked(error, cursor);
    expectStillUseful(error, 1);
  });

  it("says the same thing whatever the unusable value happens to be", async () => {
    const messages = await Promise.all(
      [{ token: SECRETS[0] }, { session: SECRETS[3] }, [SECRETS[1]]].map(
        async (cursor) =>
          (
            (await refusal(
              queryPages(
                queryClient([
                  { results: [page("a")], has_more: true, next_cursor: cursor },
                ]),
                "ds-1",
              ),
            )) as Error
          ).message,
      ),
    );

    expect(new Set(messages).size).toBe(1);
  });
});

describe("the same guards on a page's blocks", () => {
  it.each(SECRETS)("keeps a repeated child-list cursor (%s) quiet", async (cursor) => {
    const error = await refusal(
      fetchBlockTree(
        childrenClient([
          { results: [paragraph("b1")], has_more: true, next_cursor: cursor },
          { results: [paragraph("b2")], has_more: true, next_cursor: cursor },
        ]),
        "page-1",
      ),
    );

    expectNothingLeaked(error, cursor);
    expectStillUseful(error, 2);
  });

  it("keeps an unusable child-list cursor quiet", async () => {
    const cursor = { token: SECRETS[0] };
    const error = await refusal(
      fetchBlockTree(
        childrenClient([
          { results: [paragraph("b1")], has_more: true, next_cursor: cursor },
        ]),
        "page-1",
      ),
    );

    expectNothingLeaked(error, cursor);
    expectStillUseful(error, 1);
  });
});

// Notion is entitled to refuse a cursor and to quote it back while doing so —
// `body.start_cursor should be a valid uuid, instead was "…"`. That message is
// the one the script prints, so the value is scrubbed out of it on the way past,
// while everything a caller reads off the error — its status above all — is
// left exactly as it was.
describe("a cursor Notion itself refuses", () => {
  function refusingClient(cursor: string): Client {
    let call = 0;
    return {
      dataSources: {
        query: async () => {
          if (call++ === 0) {
            return { results: [page("a")], has_more: true, next_cursor: cursor };
          }
          const error = new Error(
            `body failed validation: body.start_cursor should be a valid ` +
              `uuid, instead was \`"${cursor}"\`.`,
          ) as Error & { status?: number; code?: string };
          error.status = 400;
          error.code = "validation_error";
          throw error;
        },
      },
    } as unknown as Client;
  }

  it.each(SECRETS)("does not repeat the cursor it was refused over (%s)", async (cursor) => {
    const error = await refusal(queryPages(refusingClient(cursor), "ds-1"));

    expectNothingLeaked(error, cursor);
    expect((error as Error).message).toMatch(/start_cursor/);
    expect((error as { status?: number }).status).toBe(400);
  });
});

// The sync prints `✗ sync failed: ${error.message}` and the workflow's log is
// public, so this is the output itself rather than a proxy for it.
describe("what the script would print", () => {
  it("carries the category and the page, and no cursor", async () => {
    const cursor = SECRETS[1];
    const error = await refusal(
      queryPages(
        queryClient([
          { results: [page("a")], has_more: true, next_cursor: "c1" },
          { results: [page("b")], has_more: true, next_cursor: cursor },
          { results: [page("c")], has_more: true, next_cursor: cursor },
        ]),
        "ds-1",
      ),
    );

    const printed = `✗ sync failed: ${(error as Error).message}`;
    for (const secret of SECRETS) expect(printed).not.toContain(secret);
    expect(printed).toContain("ds-1");
    expect(printed).toMatch(/page 3\b/);
  });
});

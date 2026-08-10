import type { Client, UpdatePageParameters } from "@notionhq/client";
import { fetchBlockTree, queryPages, retrievePage } from "./client";
import {
  pageDate,
  pageExcerpt,
  pageSlug,
  pageStatus,
  pageStatusType,
  pageTags,
  pageTitle,
} from "./fetch-post";
import {
  buildStatusProperty,
  DRAFT_STATUS,
  PUBLISHED_STATUS,
  type DataSourceSchema,
} from "./properties";
import { appendChildrenBody } from "./limits";
import { withRetry } from "./retry";
import type { MigrationExecutor, PageState } from "./migrate";

// The migration's half of the Notion API, in one place, so what the tests drive
// is what the script runs. Every call retries a 429 the way every other call in
// this repo does; nothing is run concurrently, because a post's batches are the
// order of its blocks and the integration gets ~3 requests/second.
//
// Both status values are built here, before the first request: a database
// missing either option would otherwise strand a page this run created as a
// draft it could never promote — or, worse, a page it published and then could
// not demote.
export function createMigrationExecutor(
  client: Client,
  dataSourceId: string,
  schema: DataSourceSchema,
): MigrationExecutor {
  const draft = buildStatusProperty(schema, DRAFT_STATUS);
  const published = buildStatusProperty(schema, PUBLISHED_STATUS);

  const update = async (
    pageId: string,
    properties: Record<string, unknown>,
  ): Promise<void> => {
    await withRetry(() =>
      client.pages.update({
        page_id: pageId,
        properties: properties as UpdatePageParameters["properties"],
      }),
    );
  };

  return {
    // Read against the same data source the plan was read from, and filtered on
    // the slug the sync itself would derive, so what this sees is what the sync
    // would call a collision. A trashed page is not returned by a query and
    // holds no slug, which is what makes trashing a page and re-running the way
    // to redo one post.
    async claimants(slug) {
      const pages = await queryPages(
        client,
        dataSourceId,
        (page) => pageSlug(page) === slug,
      );
      return pages.map((page) => ({
        pageId: page.id,
        status: pageStatus(page),
      }));
    },

    async createPage(body) {
      const page = await withRetry(() =>
        client.request<{ id: string }>({ path: "pages", method: "post", body }),
      );
      return page.id;
    },

    async appendChildren(pageId, children) {
      await withRetry(() =>
        client.blocks.children.append({
          block_id: pageId,
          ...appendChildrenBody(children),
        }),
      );
    },

    // Metadata, then the tree, then metadata again. Walking a long page takes
    // several requests, and an edit landing during the walk would otherwise
    // leave the properties describing one version of the page and the blocks
    // another — the same trap collect.ts pulled the sync out of. The two
    // versions are returned rather than compared here so the decision stays in
    // one pure function (checkDraftState).
    async readPage(pageId): Promise<PageState> {
      const before = await retrievePage(client, pageId);
      const blocks = await fetchBlockTree(client, pageId);
      const after = await retrievePage(client, pageId);

      return {
        metadata: {
          title: pageTitle(after),
          slug: pageSlug(after),
          date: pageDate(after),
          excerpt: pageExcerpt(after),
          tags: pageTags(after),
          statusType: pageStatusType(after),
        },
        status: pageStatus(after),
        trashed: after.archived === true || after.in_trash === true,
        versionBefore: before.last_edited_time,
        version: after.last_edited_time,
        blocks,
      };
    },

    updateMetadata: update,

    // The last write a page gets on a clean run, and the only one that makes it
    // visible to the sync: everything it holds is already there.
    async publishPage(pageId) {
      await update(pageId, { Status: published });
    },

    // The only write made to a published page, and only when it turns out not
    // to be the post that was supposed to be published.
    async demoteToDraft(pageId) {
      await update(pageId, { Status: draft });
    },
  };
}

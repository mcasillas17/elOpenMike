import type { PageObject } from "./client";
import type { MdBlock, PostSource, PostFrontmatter } from "./types";
import { slugify } from "./slug";

type Property = Record<string, unknown>;

function plain(property: Property | undefined): string {
  const runs = (property?.rich_text ?? property?.title) as
    | { plain_text: string }[]
    | undefined;
  return (runs ?? [])
    .map((run) => run.plain_text)
    .join("")
    .trim();
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

// Notion names the title property "Name" by default and only calls it "Title"
// if you rename it. Every database has exactly one property of type `title`,
// so find it by type rather than by name — that works whatever it is called.
function titleProperty(
  properties: Record<string, Property>,
): Property | undefined {
  return Object.values(properties).find((p) => p?.type === "title");
}

// True when the page's Status (or Select) property reads "Published".
// Accepts both property types so the database can use either.
export function isPublished(page: PageObject): boolean {
  const properties = page.properties as Record<string, Property>;
  const property = properties.Status;
  const value =
    (property?.status as { name?: string } | undefined)?.name ??
    (property?.select as { name?: string } | undefined)?.name;
  return value === "Published";
}

// Maps a Notion page's properties onto post frontmatter. `updated` comes from
// the page's last_edited_time; no Notion property is needed for it.
export function toPostSource(page: PageObject, blocks: MdBlock[]): PostSource {
  const properties = page.properties as Record<string, Property>;
  const title = plain(titleProperty(properties));
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

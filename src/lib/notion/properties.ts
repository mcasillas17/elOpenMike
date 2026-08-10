import type { UpdatePageParameters } from "@notionhq/client";

// Shapes derived from a data source's schema. A Notion property's write
// payload is keyed by its type, so anything that writes a property has to read
// the schema first rather than assume a shape.

// Derived from the SDK rather than restated, so a shape the API would refuse
// does not typecheck. The promotion to Published goes through pages.update,
// whose property values are this union.
type WritableProperty = NonNullable<UpdatePageParameters["properties"]>[string];
export type StatusPropertyValue =
  | Extract<WritableProperty, { status: unknown }>
  | Extract<WritableProperty, { select: unknown }>;

// A status or select property carries its options in the schema, under a key
// named after its own type. They are read because the migration writes two of
// them by name, and Notion refuses a `status` value that is not already an
// option of the property — a rejection that would otherwise arrive mid-run,
// after pages exist.
export type DataSourceProperty = {
  type: string;
  status?: { options?: { name?: string }[] };
  select?: { options?: { name?: string }[] };
};

export type DataSourceSchema = Record<string, DataSourceProperty>;

const STATUS_PROPERTY = "Status";

// A migration page is created holding DRAFT_STATUS and promoted to
// PUBLISHED_STATUS only once every one of its blocks has landed. The sync
// publishes exactly what reads "Published", so a page still carrying the draft
// value is invisible to the site however far through the migration it got.
export const DRAFT_STATUS = "Draft";
export const PUBLISHED_STATUS = "Published";

// Notion names the title property "Name" by default and only calls it something
// else if you rename it. Every data source has exactly one property of type
// `title`, so it is found by type — matching how fetch-post.ts reads it back.
export function titlePropertyName(schema: DataSourceSchema): string {
  return (
    Object.entries(schema).find(([, property]) => property.type === "title")?.[0] ??
    "Name"
  );
}

function optionNames(property: DataSourceProperty): string[] | undefined {
  const options = property.status?.options ?? property.select?.options;
  if (!options) return undefined;
  return options
    .map((option) => option.name)
    .filter((name): name is string => typeof name === "string");
}

// Notion offers both a Status and a Select property for tracking publication,
// and fetch-post.ts reads either. Writing the wrong one is rejected by the API
// with a validation error that names neither the property nor the fix, so the
// shape is chosen from the schema and anything else fails with an actionable
// message before a single page is created.
//
// The option itself is checked the same way and for the same reason: a `status`
// property only accepts values it already defines — the API cannot add one —
// and the migration needs both of its values to exist before it starts, not
// after it has created the first draft it could then never promote.
export function buildStatusProperty(
  schema: DataSourceSchema,
  option = PUBLISHED_STATUS,
  requireOptions = false,
): StatusPropertyValue {
  const expected = `the migration needs a Status or Select property named "${STATUS_PROPERTY}" with a "${option}" option`;
  const property = schema[STATUS_PROPERTY];

  if (!property) {
    throw new Error(`database has no "${STATUS_PROPERTY}" property — ${expected}`);
  }
  if (property.type !== "status" && property.type !== "select") {
    throw new Error(
      `"${STATUS_PROPERTY}" is a ${property.type} property — ${expected}`,
    );
  }

  const names = optionNames(property);
  if (!names && requireOptions) {
    throw new Error(
      `"${STATUS_PROPERTY}" does not expose its options — the schema must list ` +
        `"${DRAFT_STATUS}" and "${PUBLISHED_STATUS}" so they can be validated before the run`,
    );
  }
  if (names && !names.includes(option)) {
    throw new Error(
      `"${STATUS_PROPERTY}" has no "${option}" option (it offers ` +
        `${names.length > 0 ? names.map((name) => `"${name}"`).join(", ") : "none"}) — ` +
        `the migration creates every page as "${DRAFT_STATUS}" and promotes it to ` +
        `"${PUBLISHED_STATUS}" only once all of its blocks have landed, so both ` +
        "options have to exist before it runs",
    );
  }

  return property.type === "status"
    ? { status: { name: option } }
    : { select: { name: option } };
}

// The properties the migration writes into, and the type each one has to be.
// Notion refuses a value written into a property of another type — and refuses
// a property the database does not have at all — with a validation error that
// names neither the column nor the fix, arriving mid-run once pages exist.
//
// The names are the ones docs/authoring.md documents. The migration adds no
// column of its own, so a database missing one is a database this cannot write
// to, and saying which is the difference between a fixable message and a
// half-migrated blog.
const WRITTEN_PROPERTIES = {
  Slug: "rich_text",
  Excerpt: "rich_text",
  Tags: "multi_select",
  Published: "date",
} as const;

// Everything about a data source's schema that would stop the migration, all at
// once, before the first write. Pure: it is given the schema the run already
// read, and answers with problems rather than throwing, so they can be reported
// beside the posts' own.
export function schemaProblems(schema: DataSourceSchema): string[] {
  const problems: string[] = [];

  const titles = Object.entries(schema).filter(
    ([, property]) => property.type === "title",
  );
  if (titles.length === 0) {
    problems.push(
      "the database has no title property — every Notion data source has " +
        "exactly one, so the integration is reading something else",
    );
  }

  for (const [name, expected] of Object.entries(WRITTEN_PROPERTIES)) {
    const property = schema[name];
    if (!property) {
      problems.push(
        `the database has no "${name}" property — the migration writes one and ` +
          "cannot add a column, so add it in Notion (see docs/authoring.md)",
      );
      continue;
    }
    if (property.type !== expected) {
      problems.push(
        `"${name}" is a ${property.type} property where the migration writes a ` +
          `${expected} — Notion refuses a value written into another type`,
      );
    }
  }

  // The Status property is checked by the same function that builds its two
  // values, so the shape and the options the run needs cannot drift from what
  // it actually writes.
  for (const option of [DRAFT_STATUS, PUBLISHED_STATUS]) {
    try {
      buildStatusProperty(schema, option, true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!problems.includes(message)) problems.push(message);
    }
  }

  return problems;
}

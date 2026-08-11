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

// Nothing below ever repeats a name somebody typed into the workspace.
//
// A Status option, like a page title or a tag, is free-form text in a picker,
// and these messages are printed into a terminal and — for anything the sync
// runs — into a public GitHub Actions log. The options that reach a refusal are
// by definition the ones set up for somebody else's workflow, so listing them
// published exactly the names worth not publishing.
//
// What a message may carry is what identifies the problem: the property this
// repo documents by name, the category a value falls into, a count, and the two
// Status values this repo defines itself. See validate.ts.

// A page's Status, said as a category rather than as the name it holds.
// "Draft" and "Published" are this repo's own constants — the value the
// migration writes and the value the sync publishes on — so naming them repeats
// nothing an editor typed, and they are the whole point of the message.
export function describeStatus(status: string): string {
  if (status === DRAFT_STATUS || status === PUBLISHED_STATUS) {
    return `"${status}"`;
  }
  return status === ""
    ? "in no status at all"
    : "in a status this run does not write";
}

// Every property type Notion documents. A type is chosen from this list rather
// than typed, so naming one says nothing about the workspace — and it is the
// difference between "add the column" and "change the column". Anything else
// did not come from the API this code knows how to read, and is described
// rather than repeated.
const PROPERTY_TYPES = new Set([
  "button",
  "checkbox",
  "created_by",
  "created_time",
  "date",
  "email",
  "files",
  "formula",
  "last_edited_by",
  "last_edited_time",
  "multi_select",
  "number",
  "people",
  "phone_number",
  "place",
  "relation",
  "rich_text",
  "rollup",
  "select",
  "status",
  "title",
  "unique_id",
  "url",
  "verification",
]);

// The phrase that follows "is": "a date property", "a missing property", or the
// category a value nothing here recognises falls into.
export function describePropertyType(type: string): string {
  if (type === "") return "a missing property";
  return PROPERTY_TYPES.has(type)
    ? `a ${type} property`
    : "a property of a type this repo does not recognise";
}

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
      `"${STATUS_PROPERTY}" is ${describePropertyType(property.type)} — ${expected}`,
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
    // The options it does offer are names somebody typed into a picker, so they
    // are counted rather than listed: the count says the property is set up for
    // something else, which is what sends a person to look at it.
    const offered =
      names.length === 0
        ? "no options at all"
        : `${names.length} option${names.length === 1 ? "" : "s"}, none of them named that`;
    throw new Error(
      `"${STATUS_PROPERTY}" has no "${option}" option (it offers ${offered}) — ` +
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
        `"${name}" is ${describePropertyType(property.type)} where the ` +
          `migration writes a ${expected} — Notion refuses a value written ` +
          "into another type",
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

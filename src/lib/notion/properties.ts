// Shapes derived from a data source's schema. A Notion property's write
// payload is keyed by its type, so anything that writes a property has to read
// the schema first rather than assume a shape.

export type DataSourceSchema = Record<string, { type: string }>;

const STATUS_PROPERTY = "Status";

// Notion names the title property "Name" by default and only calls it something
// else if you rename it. Every data source has exactly one property of type
// `title`, so it is found by type — matching how fetch-post.ts reads it back.
export function titlePropertyName(schema: DataSourceSchema): string {
  return (
    Object.entries(schema).find(([, property]) => property.type === "title")?.[0] ??
    "Name"
  );
}

// Notion offers both a Status and a Select property for tracking publication,
// and fetch-post.ts reads either. Writing the wrong one is rejected by the API
// with a validation error that names neither the property nor the fix, so the
// shape is chosen from the schema and anything else fails with an actionable
// message before a single page is created.
export function buildStatusProperty(
  schema: DataSourceSchema,
  option = "Published",
): Record<string, { name: string }> {
  const expected = `the migration needs a Status or Select property named "${STATUS_PROPERTY}" with a "${option}" option`;
  const property = schema[STATUS_PROPERTY];

  if (!property) {
    throw new Error(`database has no "${STATUS_PROPERTY}" property — ${expected}`);
  }
  if (property.type === "status") return { status: { name: option } };
  if (property.type === "select") return { select: { name: option } };

  throw new Error(
    `"${STATUS_PROPERTY}" is a ${property.type} property — ${expected}`,
  );
}

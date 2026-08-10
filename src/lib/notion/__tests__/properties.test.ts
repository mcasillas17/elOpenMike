import { describe, it, expect } from "vitest";
import {
  titlePropertyName,
  buildStatusProperty,
  schemaProblems,
  type DataSourceSchema,
} from "@/lib/notion/properties";

const schema = (properties: Record<string, string>): DataSourceSchema =>
  Object.fromEntries(
    Object.entries(properties).map(([name, type]) => [name, { type }]),
  );

describe("titlePropertyName", () => {
  it("finds the title property by type, whatever it is called", () => {
    expect(titlePropertyName(schema({ Name: "title" }))).toBe("Name");
    expect(
      titlePropertyName(schema({ Slug: "rich_text", Heading: "title" })),
    ).toBe("Heading");
  });

  it("falls back to Notion's default name when no property is typed title", () => {
    expect(titlePropertyName(schema({ Slug: "rich_text" }))).toBe("Name");
  });
});

// The migration wrote { status: { name: "Published" } } unconditionally. Notion
// offers both a Status and a Select property for exactly this job, and the API
// rejects the payload outright when the database uses the other one — so the
// whole migration failed on the first page with a validation error that names
// neither property.
describe("buildStatusProperty", () => {
  it("emits the status shape for a Status property", () => {
    expect(buildStatusProperty(schema({ Status: "status" }))).toEqual({
      status: { name: "Published" },
    });
  });

  it("emits the select shape for a Select property", () => {
    expect(buildStatusProperty(schema({ Status: "select" }))).toEqual({
      select: { name: "Published" },
    });
  });

  it("carries a custom option name through either shape", () => {
    expect(buildStatusProperty(schema({ Status: "status" }), "Draft")).toEqual({
      status: { name: "Draft" },
    });
    expect(buildStatusProperty(schema({ Status: "select" }), "Draft")).toEqual({
      select: { name: "Draft" },
    });
  });

  it("names the problem when the database has no Status property", () => {
    expect(() => buildStatusProperty(schema({ Name: "title" }))).toThrow(
      /no "Status" property/,
    );
  });

  it("names the problem when Status is some other property type", () => {
    for (const type of ["checkbox", "multi_select", "rich_text", "formula"]) {
      expect(() => buildStatusProperty(schema({ Status: type }))).toThrow(
        new RegExp(`"Status" is a ${type} property`),
      );
    }
  });

  it("says what the schema must look like, not just that it is wrong", () => {
    expect(() => buildStatusProperty(schema({}))).toThrow(
      /Status or Select property named "Status"/,
    );
  });
});

// The migration writes two option names by hand: it creates every page as
// "Draft" and promotes it to "Published" once all of its blocks have landed.
// A `status` property only accepts options it already defines and the API
// cannot add one, so a database missing either name has to fail here — before
// the first page — rather than mid-run, with drafts already created that could
// then never be promoted.
describe("the options the migration writes by name", () => {
  const withOptions = (
    type: "status" | "select",
    ...names: string[]
  ): DataSourceSchema => ({
    Status: { type, [type]: { options: names.map((name) => ({ name })) } },
  });

  it("accepts a database offering both of them", () => {
    for (const type of ["status", "select"] as const) {
      expect(
        buildStatusProperty(withOptions(type, "Draft", "Published"), "Draft"),
      ).toEqual({ [type]: { name: "Draft" } });
      expect(
        buildStatusProperty(withOptions(type, "Draft", "Published")),
      ).toEqual({ [type]: { name: "Published" } });
    }
  });

  it("refuses a database with nothing to migrate into", () => {
    expect(() =>
      buildStatusProperty(withOptions("status", "Published"), "Draft"),
    ).toThrow(/no "Draft" option/);
  });

  it("refuses a database a draft could never be promoted in", () => {
    expect(() =>
      buildStatusProperty(withOptions("status", "Draft"), "Published"),
    ).toThrow(/no "Published" option/);
  });

  it("lists the options the database does offer", () => {
    expect(() =>
      buildStatusProperty(withOptions("select", "Idea", "Live"), "Draft"),
    ).toThrow(/"Idea", "Live"/);
  });

  // Only the shape is checked when the schema carries no options at all, which
  // is what every caller that builds one by hand looks like.
  it("checks only the shape when the schema lists no options", () => {
    expect(buildStatusProperty(schema({ Status: "status" }), "Draft")).toEqual({
      status: { name: "Draft" },
    });
  });

  describe("the schema shared by sync and migration", () => {
    const complete: DataSourceSchema = {
      Name: { type: "title" },
      Slug: { type: "rich_text" },
      Excerpt: { type: "rich_text" },
      Tags: { type: "multi_select" },
      Status: {
        type: "status",
        status: { options: [{ name: "Draft" }, { name: "Published" }] },
      },
      Published: { type: "date" },
    };

    const without = (name: string): DataSourceSchema => {
      const copy = { ...complete };
      delete copy[name];
      return copy;
    };

    it.each(["Name", "Slug", "Excerpt", "Tags", "Status", "Published"])(
      "rejects a schema missing required property %s",
      (name) => {
        const problems = schemaProblems(without(name)).join("\n");
        expect(problems).toMatch(
          name === "Name" ? /title property/i : new RegExp(name),
        );
      },
    );

    it.each([
      ["Name", "rich_text"],
      ["Slug", "number"],
      ["Excerpt", "number"],
      ["Tags", "rich_text"],
      ["Status", "rich_text"],
      ["Published", "rich_text"],
    ])("rejects required property %s with type %s", (name, type) => {
      const problems = schemaProblems({
        ...complete,
        [name]: { type },
      }).join("\n");

      expect(problems).toMatch(name === "Name" ? /title property/i : new RegExp(name));
      if (name !== "Name") expect(problems).toMatch(new RegExp(type));
    });

    it.each(["Draft", "Published"])(
      "rejects Status without required option %s",
      (missing) => {
        const offered = missing === "Draft" ? "Published" : "Draft";
        const problems = schemaProblems({
          ...complete,
          Status: {
            type: "status",
            status: { options: [{ name: offered }] },
          },
        }).join("\n");

        expect(problems).toMatch(new RegExp(missing));
      },
    );

    it("rejects a Status schema that does not expose its options", () => {
      expect(
        schemaProblems({ ...complete, Status: { type: "status" } }).join("\n"),
      ).toMatch(/options/i);
    });
  });
});

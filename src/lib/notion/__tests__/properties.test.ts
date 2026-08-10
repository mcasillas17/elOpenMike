import { describe, it, expect } from "vitest";
import {
  titlePropertyName,
  buildStatusProperty,
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

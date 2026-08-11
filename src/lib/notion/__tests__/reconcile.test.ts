import { describe, it, expect } from "vitest";
import { planReconcile } from "@/lib/notion/reconcile";

describe("planReconcile", () => {
  it("writes new files", () => {
    const plan = planReconcile(new Map([["a.mdx", "A"]]), new Map());
    expect(plan).toEqual({ write: ["a.mdx"], delete: [], unchanged: [] });
  });

  it("leaves identical files alone", () => {
    const plan = planReconcile(
      new Map([["a.mdx", "A"]]),
      new Map([["a.mdx", "A"]]),
    );
    expect(plan).toEqual({ write: [], delete: [], unchanged: ["a.mdx"] });
  });

  it("rewrites changed files", () => {
    const plan = planReconcile(
      new Map([["a.mdx", "A2"]]),
      new Map([["a.mdx", "A"]]),
    );
    expect(plan).toEqual({ write: ["a.mdx"], delete: [], unchanged: [] });
  });

  it("deletes orphans", () => {
    const plan = planReconcile(new Map(), new Map([["gone.mdx", "G"]]));
    expect(plan).toEqual({ write: [], delete: ["gone.mdx"], unchanged: [] });
  });

  it("returns paths sorted so runs are deterministic", () => {
    const plan = planReconcile(
      new Map([
        ["b.mdx", "B"],
        ["a.mdx", "A"],
      ]),
      new Map([
        ["z.mdx", "Z"],
        ["y.mdx", "Y"],
      ]),
    );
    expect(plan.write).toEqual(["a.mdx", "b.mdx"]);
    expect(plan.delete).toEqual(["y.mdx", "z.mdx"]);
  });
});

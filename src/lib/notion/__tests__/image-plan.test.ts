import { describe, it, expect } from "vitest";
import {
  planImages,
  type ImagePlan,
} from "@/lib/notion/image-plan";

const bytes = (value: string) => new TextEncoder().encode(value);

const dir = (slug: string) => `public/images/blog/${slug}`;
const file = (slug: string, name: string) => `${dir(slug)}/${name}`;

const plan = (
  desired: [string, string][],
  existing: [string, string][],
  prunable: string[],
): ImagePlan =>
  planImages(
    new Map(desired.map(([path, value]) => [path, bytes(value)])),
    new Map(existing.map(([path, value]) => [path, bytes(value)])),
    prunable,
  );

// `--check` compared MDX files only, so a run that would rewrite or delete
// images reported "in sync" — the drift gate was blind to exactly the half of
// the sync that touches binary files. Both halves are now planned the same way
// and the same plan is what the writing path applies.
describe("planImages", () => {
  it("writes an image that is not on disk yet", () => {
    const result = plan([[file("a", "aa.png"), "A"]], [], [dir("a")]);
    expect(result).toEqual({
      write: [file("a", "aa.png")],
      delete: [],
      unchanged: [],
    });
  });

  it("rewrites an image whose bytes changed under the same name", () => {
    const result = plan(
      [[file("a", "aa.png"), "fresh"]],
      [[file("a", "aa.png"), "truncated"]],
      [dir("a")],
    );
    expect(result.write).toEqual([file("a", "aa.png")]);
    expect(result.unchanged).toEqual([]);
  });

  it("reports identical images as unchanged", () => {
    const result = plan(
      [[file("a", "aa.png"), "same"]],
      [[file("a", "aa.png"), "same"]],
      [dir("a")],
    );
    expect(result).toEqual({
      write: [],
      delete: [],
      unchanged: [file("a", "aa.png")],
    });
  });

  it("deletes an orphan in a directory this run rendered", () => {
    const result = plan(
      [[file("a", "keep.png"), "K"]],
      [
        [file("a", "keep.png"), "K"],
        [file("a", "stale.png"), "S"],
      ],
      [dir("a")],
    );
    expect(result.delete).toEqual([file("a", "stale.png")]);
  });

  it("leaves every file in a directory it may not prune", () => {
    const result = plan(
      [],
      [
        [file("failed", "one.png"), "1"],
        [file("failed", "two.png"), "2"],
      ],
      [],
    );
    expect(result).toEqual({ write: [], delete: [], unchanged: [] });
  });

  it("prunes only the directories it was given", () => {
    const result = plan(
      [],
      [
        [file("rendered", "stale.png"), "S"],
        [file("failed", "kept.png"), "K"],
      ],
      [dir("rendered")],
    );
    expect(result.delete).toEqual([file("rendered", "stale.png")]);
  });

  it("does not treat a directory prefix as a directory match", () => {
    const result = plan(
      [],
      [[file("a-post-2", "stale.png"), "S"]],
      [dir("a-post")],
    );
    expect(result.delete).toEqual([]);
  });

  it("sorts every list so two runs log the same thing", () => {
    const result = plan(
      [
        [file("b", "new.png"), "B"],
        [file("a", "new.png"), "A"],
      ],
      [
        [file("b", "old.png"), "OB"],
        [file("a", "old.png"), "OA"],
      ],
      [dir("a"), dir("b")],
    );
    expect(result.write).toEqual([file("a", "new.png"), file("b", "new.png")]);
    expect(result.delete).toEqual([file("a", "old.png"), file("b", "old.png")]);
  });
});

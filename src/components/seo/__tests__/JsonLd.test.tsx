import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { JsonLd } from "@/components/seo/JsonLd";

describe("JsonLd", () => {
  it("emits a Person graph as ld+json", () => {
    const { container } = render(<JsonLd />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeTruthy();
    const data = JSON.parse(script!.textContent!);
    const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("Person");
    expect(types).toContain("WebSite");
    expect(JSON.stringify(data)).toContain("Miguel Casillas");
  });
});

import { ArticleJsonLd } from "@/components/seo/ArticleJsonLd";

function parseJsonLd(container: HTMLElement): Record<string, unknown> {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.innerHTML ?? "{}");
}

describe("ArticleJsonLd dateModified", () => {
  const base = {
    slug: "a-post",
    title: "A post",
    description: "Summary.",
    date: "2026-05-20",
    tags: ["AI"],
  };

  it("uses updated for dateModified when present", () => {
    const { container } = render(
      <ArticleJsonLd {...base} updated="2026-06-01" />,
    );
    const data = parseJsonLd(container);
    expect(data.datePublished).toBe("2026-05-20");
    expect(data.dateModified).toBe("2026-06-01");
  });

  it("falls back to the published date when updated is absent", () => {
    const { container } = render(<ArticleJsonLd {...base} />);
    const data = parseJsonLd(container);
    expect(data.dateModified).toBe("2026-05-20");
  });
});

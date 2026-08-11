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

// A post title containing "</script>" would close the tag early: everything
// after it stops being JSON and becomes live markup in the document.
describe("ArticleJsonLd script-tag injection", () => {
  const hostile = '</script><script>alert("xss")</script>';

  it("emits no literal closing script sequence for hostile metadata", () => {
    const { container } = render(
      <ArticleJsonLd
        slug="a-post"
        title={hostile}
        description={`desc ${hostile}`}
        date="2026-05-20"
        tags={[hostile, "a & b"]}
      />,
    );

    const script = container.querySelector('script[type="application/ld+json"]');
    const payload = script?.innerHTML ?? "";
    expect(payload.toLowerCase()).not.toContain("</script");
    expect(payload).not.toContain("<");
    expect(container.querySelectorAll("script")).toHaveLength(1);
  });

  it("still decodes to the original metadata", () => {
    const { container } = render(
      <ArticleJsonLd
        slug="a-post"
        title={hostile}
        description="Summary."
        date="2026-05-20"
        tags={[hostile]}
      />,
    );
    const data = parseJsonLd(container);
    expect(data.headline).toBe(hostile);
    expect(data.keywords).toBe(hostile);
  });
});

describe("JsonLd script-tag injection", () => {
  it("emits no literal closing script sequence", () => {
    const { container } = render(<JsonLd />);
    const payload =
      container.querySelector('script[type="application/ld+json"]')?.innerHTML ??
      "";
    expect(payload.toLowerCase()).not.toContain("</script");
    expect(payload).not.toContain("<");
    expect(JSON.parse(payload)["@context"]).toBe("https://schema.org");
  });
});

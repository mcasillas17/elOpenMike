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

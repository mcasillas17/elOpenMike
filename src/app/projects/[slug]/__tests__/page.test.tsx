import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectDetailPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/projects/[slug]/page";
import { getAllSlugs } from "@/data/projects";

describe("/projects/[slug] detail page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getAllSlugs().map((slug) => ({ slug })),
    );
  });

  it("renders a known project", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: "web-slinger-cli" }),
    });
    render(ui);
    expect(
      screen.getByRole("heading", { level: 1, name: /Web-Slinger CLI/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to projects/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("sets metadata title to the project name", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "web-slinger-cli" }),
    });
    expect(meta.title).toBe("Web-Slinger CLI");
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow();
  });
});

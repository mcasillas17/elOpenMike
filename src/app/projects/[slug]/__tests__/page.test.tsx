import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectDetailPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/projects/[slug]/page";
import { projects, getAllSlugs } from "@/data/projects";

const sample = projects[0];

describe("/projects/[slug] detail page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getAllSlugs().map((slug) => ({ slug })),
    );
  });

  it("renders the project title as an h1", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    expect(
      screen.getByRole("heading", { level: 1, name: sample.title }),
    ).toBeInTheDocument();
  });

  it("renders the 'Back to The Casefile' link to /projects", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    expect(
      screen.getByRole("link", { name: /back to the casefile/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("renders each highlight bullet", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    for (const h of sample.highlights) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
  });

  it("sets metadata title and description from the project", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: sample.slug }),
    });
    expect(meta.title).toBe(sample.title);
    expect(meta.description).toBe(sample.summary);
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow();
  });
});
